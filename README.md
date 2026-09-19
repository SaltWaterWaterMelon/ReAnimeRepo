# Re:ANIME for AnymeX

An AnymeX-compatible JavaScript anime source for [Re:ANIME](https://reanime.to/).

## Install

Add this repository's raw `anime_index.json` URL to AnymeX:

`https://raw.githubusercontent.com/SaltWaterWaterMelon/ReAnimeRepo/main/anime_index.json`

## What it supports

- Anime search
- Anime details and episode lists
- Sub/dub server discovery
- Re:ANIME home/latest and weekly top lists
- Uses Re:ANIME's public web API endpoints directly

### Playback note

Re:ANIME currently returns FlixCloud embed links for its streaming servers. This extension exposes those links without attempting to bypass or decrypt the embed provider's protected stream layer. If AnymeX cannot play an embed URL directly on your platform, search/details will still work but native playback may require a future extractor update.

Re:ANIME currently advertises HD/1080p and AV1 availability on its site. The site's API and page structure can change, so this extension may need maintenance when Re:ANIME changes its endpoints.

## Source

Target site: https://reanime.to/
