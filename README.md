# moviemeter
IMDb Moviemeter as a Service

## Usage
`curl https://moviemeter.hafs.in/list.json?`

### Options
* **list**: popular (default) / top / ls01234567
* **year**: Minimum year, can be absolute or relateve. ex: 2019, -2, -0
* **rating**: Minimum rating. ex: 5.0
* **votes**: Minimum number of votes. ex: 50000
* **max**: Maximum number of items. ex: 10

### Example URLs
* https://moviemeter.hafs.in/list.json?year=-2&max=20&rating=6&votes=50000
* https://moviemeter.hafs.in/list.json?list=top&max=5 (Top 5 movies)
* https://moviemeter.hafs.in/list.json?list=ls027181777&year=2018 (Marvel movies since 2018)
