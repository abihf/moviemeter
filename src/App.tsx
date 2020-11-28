import React, { useEffect, useReducer, useState } from "react";
import {
  createStyles,
  makeStyles,
  Theme,
  CssBaseline,
  Container,
  Paper,
  TextField,
  InputAdornment,
  Grid,
  Link,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  CircularProgress,
} from "@material-ui/core";
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import GitHubIcon from "@material-ui/icons/GitHub";
import PublicIcon from "@material-ui/icons/Public";
import { Autocomplete } from "@material-ui/lab";
import querystring from "querystring";
import { createBrowserHistory } from "history";

const browserHistory = createBrowserHistory();

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      flexGrow: 1,
    },
    title: {
      flexGrow: 1,
    },
    container: {
      marginTop: theme.spacing(4),
    },
    paper: {
      padding: theme.spacing(1),
      marginBottom: theme.spacing(2),
    },
  })
);

type Filter = {
  list: string;
  year: number;
  rating: number;
  votes: number;
  max: number;

  fromUrl?: boolean;
};

type NamedFilter = Filter & { name: string };

const presets: NamedFilter[] = [
  {
    name: "Popular",
    list: "popular",
    year: -1,
    rating: 5.0,
    votes: 50000,
    max: 20,
  },
  {
    name: "Top 10",
    list: "top",
    year: 0,
    rating: 0,
    votes: 0,
    max: 10,
  },
];

type MovieItem = {
  imdb_id: string;
  title: string;
  year: number;
  rating: number;
  votes: number;
};

const reducer: React.Reducer<Partial<Filter>, Partial<Filter>> = (
  prev,
  filter
) => {
  return { ...prev, fromUrl: false, ...filter };
};
function parseFilterFromQuery(url?: string): Partial<Filter> {
  const usedUrl = url || browserHistory.location.search;
  const parsed = querystring.parse(usedUrl.substr(1)) as Record<string, string>;
  return {
    list: parsed.list || "",
    year: parsed.year ? parseInt(parsed.year, 10) : 0,
    rating: parsed.rating ? parseFloat(parsed.rating) : 0,
    votes: parsed.votes ? parseInt(parsed.votes, 10) : 0,
    max: parsed.max ? parseInt(parsed.max, 10) : 0,
    fromUrl: true,
  };
}

function encodeQuery(
  obj: Record<string, string | number | boolean | undefined>
): string {
  const encoded = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value && !["name", "fromUrl"].includes(key))
      encoded.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
  }
  return encoded.join("&");
}

export default function App() {
  const classes = useStyles();
  const [filter, setFilter] = useReducer(reducer, parseFilterFromQuery());
  useEffect(() => {
    return browserHistory.listen((update) => {
      if (update.action === "POP")
        setFilter(parseFilterFromQuery(update.location.search));
    });
  }, []);

  const debouncedFilter = useDebounce(filter, 500);
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    if (!debouncedFilter.fromUrl)
      browserHistory.push("/?" + encodeQuery(debouncedFilter));

    setIsFetching(true);
    const ac = new AbortController();
    fetch("/list.json?" + encodeQuery(debouncedFilter), { signal: ac.signal })
      .then((res) => res.json())
      .then((result: MovieItem[]) => {
        setMovies(result);
      })
      .catch((err) => setError(err))
      .finally(() => setIsFetching(false));

    return () => ac.abort();
  }, [debouncedFilter]);

  const baseUrl = document.location.protocol + "://" + document.location.host;
  const url = "/list.json?" + encodeQuery(filter);
  return (
    <div className={classes.root}>
      <CssBaseline />
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" className={classes.title}>
            Moviemeter
          </Typography>
          <div>
            <IconButton
              component="a"
              title="Source Code"
              href="https://github.com/abihf/moviemeter"
              aria-controls="menu-appbar"
              color="inherit"
            >
              <GitHubIcon />
            </IconButton>
          </div>
        </Toolbar>
      </AppBar>
      <Container className={classes.container}>
        <form noValidate autoComplete="off">
          <Paper className={classes.paper}>
            <TextField
              id="url"
              value={baseUrl + url}
              fullWidth
              InputProps={{
                readOnly: true,
                startAdornment: (
                  <InputAdornment position="start">
                    <PublicIcon />
                  </InputAdornment>
                ),
                onClick: (e) => (e.target as any).select(),
              }}
              label="URL"
            />
            Presets:
            <ul>
              {presets.map((preset) => {
                const encoded = encodeQuery(preset);
                return (
                  <li key={encoded}>
                    <a
                      href={"/?" + encoded}
                      onClick={(e) => {
                        e.preventDefault();
                        setFilter(preset);
                      }}
                    >
                      {baseUrl}/list.json?{encoded}
                    </a>
                  </li>
                );
              })}
            </ul>
          </Paper>
          <Paper className={classes.paper}>
            <Typography variant="subtitle1">Customize</Typography>
            <Grid container className={classes.root} spacing={2}>
              <Grid item xs={6} md={2}>
                <Autocomplete
                  id="list-name"
                  freeSolo
                  options={["popular", "top"]}
                  fullWidth={false}
                  value={filter.list}
                  onChange={(e, value) => setFilter({ list: value! })}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      onChange={(e) =>
                        setFilter({ list: e.currentTarget.value })
                      }
                      label="List"
                      margin="normal"
                    />
                  )}
                />
              </Grid>
              <Grid item xs={6} md={2}>
                <TextField
                  type="number"
                  label="Year"
                  value={filter.year}
                  onChange={(e) =>
                    setFilter({ year: parseInt(e.currentTarget.value, 10) })
                  }
                  margin="normal"
                  fullWidth
                />
              </Grid>
              <Grid item xs={6} md={2}>
                <TextField
                  type="number"
                  label="Rating"
                  value={filter.rating}
                  onChange={(e) =>
                    setFilter({ rating: parseFloat(e.currentTarget.value) })
                  }
                  margin="normal"
                  fullWidth
                />
              </Grid>
              <Grid item xs={6} md={2}>
                <TextField
                  type="number"
                  label="Votes"
                  value={filter.votes}
                  onChange={(e) =>
                    setFilter({ votes: parseInt(e.currentTarget.value, 10) })
                  }
                  margin="normal"
                  fullWidth
                />
              </Grid>
              <Grid item xs={6} md={2}>
                <TextField
                  type="number"
                  label="Max Item"
                  value={filter.max}
                  onChange={(e) =>
                    setFilter({ max: parseInt(e.currentTarget.value, 10) })
                  }
                  margin="normal"
                  fullWidth
                />
              </Grid>
              <Grid item xs={6} md={2}>
                {isFetching && <CircularProgress />}
              </Grid>
            </Grid>
          </Paper>
          <TableContainer component={Paper}>
            <Table aria-label="Preview">
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell align="center">Year</TableCell>
                  <TableCell align="center">Rating</TableCell>
                  <TableCell align="center">Votes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {movies.map((movie) => (
                  <TableRow key={movie.imdb_id}>
                    <TableCell component="th" scope="row">
                      <a href={`https://www.imdb.com/title/${movie.imdb_id}/`}>
                        {movie.title}
                      </a>
                    </TableCell>
                    <TableCell align="center">{movie.year}</TableCell>
                    <TableCell align="center">{movie.rating}</TableCell>
                    <TableCell align="center">{movie.votes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </form>
      </Container>
    </div>
  );
}

function useDebounce<T>(value: T, delay: number) {
  // State and setters for debounced value
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(
    () => {
      // Set debouncedValue to value (passed in) after the specified delay
      const handler = setTimeout(() => {
        setDebouncedValue(value);
      }, delay);

      // Return a cleanup function that will be called every time ...
      // ... useEffect is re-called. useEffect will only be re-called ...
      // ... if value changes (see the inputs array below).
      // This is how we prevent debouncedValue from changing if value is ...
      // ... changed within the delay period. Timeout gets cleared and restarted.
      // To put it in context, if the user is typing within our app's ...
      // ... search box, we don't want the debouncedValue to update until ...
      // ... they've stopped typing for more than 500ms.
      return () => {
        clearTimeout(handler);
      };
    },
    // Only re-call effect if value changes
    // You could also add the "delay" var to inputs array if you ...
    // ... need to be able to change that dynamically.
    [delay, value]
  );

  return debouncedValue;
}
