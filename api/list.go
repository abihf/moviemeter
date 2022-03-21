package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	loader "github.com/abihf/cache-loader"
	"github.com/go-http-utils/etag"
)

const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36"

var imdbIDExtractor = regexp.MustCompile("tt\\d+")
var imdbRatingParser = regexp.MustCompile("([0-9.]+) base on ([0-9,]+) ")

var httpClient = http.Client{
	Timeout: 60 * time.Second,
}

var cache = loader.NewLRU(fetchList, 6*time.Hour, 1000)

type movieItem struct {
	ID     string  `json:"imdb_id"`
	Title  string  `json:"title"`
	Year   int     `json:"year,omitempty"`
	Rank   int     `json:"rank,omitempty"`
	Rating float32 `json:"rating"`
	Votes  int64   `json:"votes"`
}

type movieList []*movieItem

func Handler(w http.ResponseWriter, r *http.Request) {
	etag.Handler(http.HandlerFunc(handleList), false).ServeHTTP(w, r)
}

func handleList(w http.ResponseWriter, r *http.Request) {
	list, err := listMovies(r.URL.Query())
	if err != nil {
		w.WriteHeader(500)
		fmt.Fprintf(w, "Error getting list: %v", err)
		return
	}
	w.Header().Set("content-type", "application/json")
	w.Header().Set("cache-control", "public, stale-while-revalidate=3600, max-age=3600")
	json.NewEncoder(w).Encode(list)
}

func listMovies(filter url.Values) (movieList, error) {
	maxItem := math.MaxInt32
	minYear := 0
	minRating := float32(0.0)
	minVotes := int64(1)
	maxRank := math.MaxInt32

	listName := filter.Get("list")
	if listName == "" {
		listName = "popular"
	}

	freshFilter := filter.Get("fresh")
	if freshFilter == "True" {
		minYear = time.Now().Year() - 1
	}

	yearStr := filter.Get("year")
	if yearStr != "" {
		if yearStr[0] == '-' {
			yearDelta, err := strconv.Atoi(yearStr[1:])
			if err != nil {
				return nil, fmt.Errorf("Can not parse year: %w", err)
			}
			minYear = time.Now().Year() - yearDelta
		} else {
			newYear, err := strconv.Atoi(yearStr)
			if err != nil {
				return nil, fmt.Errorf("Can not parse year: %w", err)
			}
			minYear = newYear
		}
	}

	ratingStr := filter.Get("rating")
	if ratingStr != "" {
		newRating, err := strconv.ParseFloat(ratingStr, 32)
		if err != nil {
			return nil, fmt.Errorf("Can not parse rating: %w", err)
		}
		minRating = float32(newRating)
	}

	votesStr := filter.Get("votes")
	if votesStr != "" {
		newVotes, err := strconv.ParseInt(votesStr, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("Can not parse votes: %w", err)
		}
		minVotes = newVotes
	}

	rankStr := filter.Get("rank")
	if rankStr != "" {
		newRank, err := strconv.Atoi(rankStr)
		if err != nil {
			return nil, fmt.Errorf("Can not parse rank: %w", err)
		}
		maxRank = newRank
	}

	maxStr := filter.Get("max")
	if maxStr != "" {
		newMaxItem, err := strconv.Atoi(maxStr)
		if err != nil {
			return nil, fmt.Errorf("Can not parse max: %w", err)
		}
		maxItem = newMaxItem
	}

	list, err := cache.Load(listName)
	if err != nil {
		return nil, err
	}
	newList := make(movieList, len(list))
	size := 0
	for _, item := range list {
		if size >= maxItem || item == nil {
			continue
		}
		if item.Year >= minYear && item.Rating >= minRating && item.Votes >= minVotes && item.Rank <= maxRank {
			newList[size] = item
			size++
		}
	}

	return newList[0:size], nil
}

func fetchList(ctx context.Context, listName string) (movieList, error) {
	isUserList := false
	var url string
	if listName[0:2] == "ls" {
		isUserList = true
		url = fmt.Sprintf("https://www.imdb.com/list/%s/?mode=simple", listName)
	} else if listName == "popular" {
		url = "https://www.imdb.com/chart/moviemeter/"
	} else if listName == "top" {
		url = "https://www.imdb.com/chart/top/"
	} else {
		return nil, fmt.Errorf("Invalid list name")
	}

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("Error when requesting IMDb page: %w", err)
	}
	req.Header.Set("user-agent", userAgent)
	req.Header.Add("connection", "keep-alive")

	res, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Error when fetching IMDb page: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		return nil, fmt.Errorf("IMDb return status code %d", res.StatusCode)
	}

	doc, err := goquery.NewDocumentFromResponse(res)
	if err != nil {
		return nil, fmt.Errorf("Error when parsing IMDb page: %w", err)
	}

	if isUserList {
		return parseUserList(doc)
	}
	return parseChartPage(doc)
}

func parseChartPage(doc *goquery.Document) (movieList, error) {
	rowNodes := doc.Find(".chart tbody tr")
	list := make(movieList, rowNodes.Length())
	rowNodes.EachWithBreak(func(i int, row *goquery.Selection) bool {
		defer func() {
			// log error and ignore it
			err := recover()
			if err != nil {
				fmt.Printf("Error when parsing item %d: %v\n", i, err)
			}
		}()

		title := row.Find(".titleColumn a").Text()
		href := row.Find(".posterColumn a").AttrOr("href", "")
		id := imdbIDExtractor.FindString(href)
		yearStr := row.Find(".titleColumn .secondaryInfo").First().Text()
		year, _ := strconv.Atoi(yearStr[1:5])
		rank, _ := strconv.Atoi(row.Find("[name=\"rk\"]").AttrOr("data-value", "0"))
		rating, _ := strconv.ParseFloat(row.Find("[name=\"ir\"]").AttrOr("data-value", "0.0"), 32)
		votes, _ := strconv.ParseInt(row.Find("[name=\"nv\"]").AttrOr("data-value", "0"), 10, 64)

		list[i] = &movieItem{
			ID:     id,
			Title:  title,
			Year:   year,
			Rank:   rank,
			Rating: float32(rating),
			Votes:  votes,
		}
		return true
	})

	return list, nil
}

func parseUserList(doc *goquery.Document) (movieList, error) {
	rowNodes := doc.Find(".lister-item")
	list := make(movieList, rowNodes.Length())
	rowNodes.Each(func(i int, row *goquery.Selection) {
		defer func() {
			// log error and ignore it
			err := recover()
			if err != nil {
				fmt.Printf("Error when parsing item %d: %v\n", i, err)
			}
		}()

		linkElm := row.Find("span a").First()
		title := linkElm.Text()
		href := linkElm.AttrOr("href", "")
		id := imdbIDExtractor.FindString(href)
		yearStr := row.Find(".lister-item-year").Text()
		year := 0
		if yearStr != "" {
			year, _ = strconv.Atoi(yearStr[1:5])
		}

		var rating float64 = 0
		var votes int64 = 0
		ratingStr := row.Find(".col-imdb-rating strong").AttrOr("title", "")
		extractedRating := imdbRatingParser.FindStringSubmatch(ratingStr)
		if len(extractedRating) > 2 {
			rating, _ = strconv.ParseFloat(extractedRating[1], 32)
			votes, _ = strconv.ParseInt(strings.ReplaceAll(extractedRating[2], ",", ""), 10, 64)
		}

		list[i] = &movieItem{
			ID:     id,
			Title:  title,
			Year:   year,
			Rating: float32(rating),
			Votes:  votes,
		}
	})

	return list, nil
}
