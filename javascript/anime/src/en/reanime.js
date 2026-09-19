const mangayomiSources = [{
  "name": "Re:ANIME",
  "lang": "en",
  "baseUrl": "https://reanime.to",
  "apiUrl": "",
  "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://reanime.to/",
  "typeSource": "multi",
  "itemType": 1,
  "version": "0.1.0",
  "pkgPath": "anime/src/en/reanime.js"
}];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  async api(path, params = {}) {
    const query = Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
      .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
      .join("&");

    const url = this.source.baseUrl + path + (query ? "?" + query : "");
    const res = await this.client.get(url, {
      "Accept": "application/json, */*",
      "User-Agent": "Mozilla/5.0"
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error("Re:ANIME API request failed: " + res.statusCode);
    }

    return JSON.parse(res.body);
  }

  unwrap(data, keys) {
    if (Array.isArray(data)) return data;
    for (const key of keys) {
      if (data && Array.isArray(data[key])) return data[key];
    }
    return [];
  }

  titleOf(anime) {
    if (!anime) return "Unknown";
    if (typeof anime.title === "string") return anime.title;
    if (anime.title) {
      return anime.title.english ||
             anime.title.romaji ||
             anime.title.native ||
             Object.values(anime.title).find((x) => typeof x === "string") ||
             "Unknown";
    }
    return anime.name || anime.title_english || anime.title_romaji || "Unknown";
  }

  imageOf(anime) {
    if (!anime) return "";
    if (typeof anime.cover_image === "string") return anime.cover_image;
    if (anime.cover_image) {
      return anime.cover_image.extra_large ||
             anime.cover_image.large ||
             anime.cover_image.medium ||
             "";
    }
    if (typeof anime.coverImage === "string") return anime.coverImage;
    if (anime.coverImage) {
      return anime.coverImage.extraLarge ||
             anime.coverImage.large ||
             anime.coverImage.medium ||
             "";
    }
    return anime.image || anime.poster || "";
  }

  slugOf(anime) {
    return anime.slug ||
           anime.id ||
           anime.anime_id ||
           anime.uid ||
           anime.identifier ||
           "";
  }

  async getPopular(page) {
    const data = await this.api("/api/top/anime", {
      period: "week",
      limit: 20,
      offset: Math.max(0, ((page || 1) - 1) * 20)
    });

    const items = this.unwrap(data, ["data", "results", "anime", "items"]);
    return {
      list: items.map((a) => ({
        name: this.titleOf(a),
        link: this.slugOf(a),
        imageUrl: this.imageOf(a)
      })),
      hasNextPage: items.length >= 20
    };
  }

  async getLatestUpdates(page) {
    const data = await this.api("/api/home/latest-aired", {
      limit: 20,
      offset: Math.max(0, ((page || 1) - 1) * 20)
    });

    const items = this.unwrap(data, ["data", "results", "anime", "items"]);
    return {
      list: items.map((a) => ({
        name: this.titleOf(a),
        link: this.slugOf(a),
        imageUrl: this.imageOf(a)
      })),
      hasNextPage: items.length >= 20
    };
  }

  async search(query, page, filters) {
    const data = await this.api("/api/search", {
      q: query,
      limit: 20,
      offset: Math.max(0, ((page || 1) - 1) * 20)
    });

    const items = this.unwrap(data, ["data", "results", "anime", "items"]);
    return {
      list: items.map((a) => ({
        name: this.titleOf(a),
        link: this.slugOf(a),
        imageUrl: this.imageOf(a)
      })),
      hasNextPage: items.length >= 20
    };
  }

  statusCode(status) {
    if (typeof status !== "string") return 5;
    switch (status.toUpperCase()) {
      case "RELEASING":
      case "CURRENT":
      case "AIRING":
        return 0;
      case "FINISHED":
      case "FINISHED_AIRING":
        return 1;
      case "HIATUS":
        return 2;
      case "NOT_YET_RELEASED":
      case "UPCOMING":
        return 3;
      case "CANCELLED":
        return 4;
      default:
        return 5;
    }
  }

  async getDetail(url) {
    const slug = String(url).replace(this.source.baseUrl + "/watch/", "");
    const data = await this.api("/api/episodes/" + encodeURIComponent(slug));

    const episodes = this.unwrap(data, ["data", "episodes", "results"]);
    let anime = null;

    if (data && data.anime) anime = data.anime;
    if (!anime) {
      try {
        const first = await this.api("/api/watch/" + encodeURIComponent(slug) + "/1");
        anime = first.anime || null;
      } catch (_) {}
    }

    const chapters = episodes.map((ep) => {
      const number = ep.number ?? ep.episode ?? ep.episodeNumber ?? ep.ep ?? 0;
      const title = ep.title || ep.name || "";
      return {
        name: "E" + number + (title ? ": " + title : ""),
        url: slug + "||" + number
      };
    }).sort((a, b) => {
      const na = parseFloat(a.name.slice(1)) || 0;
      const nb = parseFloat(b.name.slice(1)) || 0;
      return nb - na;
    });

    const genres = anime && Array.isArray(anime.genres) ? anime.genres : [];

    return {
      name: this.titleOf(anime) || slug,
      imageUrl: this.imageOf(anime),
      description: anime && (anime.description || anime.synopsis || anime.synopsys) || "",
      genres,
      status: this.statusCode(anime && anime.status),
      link: slug,
      chapters
    };
  }

  async getVideoList(url) {
    const parts = String(url).split("||");
    const slug = parts[0];
    const episode = parseInt(parts[1], 10);

    if (!slug || !Number.isFinite(episode)) return [];

    const watch = await this.api("/api/watch/" + encodeURIComponent(slug) + "/" + episode);
    const links = Array.isArray(watch.episode_links) ? watch.episode_links : [];

    const streams = links
      .filter((item) => item && item.dataLink)
      .map((item) => ({
        url: item.dataLink,
        originalUrl: item.dataLink,
        quality: (item.serverName || "Re:ANIME") + " - " + (item.dataType || "stream").toUpperCase()
      }));

    // The site may expose additional FlixCloud servers keyed by AniList ID.
    const anime = watch.anime || {};
    const anilistId = anime.anilist || anime.anilist_id;
    if (anilistId) {
      try {
        const flix = await this.api("/api/flix/" + anilistId + "/" + episode);
        const extra = flix && Array.isArray(flix.servers) ? flix.servers : [];
        for (const item of extra) {
          if (!item || !item.dataLink) continue;
          if (streams.some((s) => s.url === item.dataLink)) continue;
          streams.push({
            url: item.dataLink,
            originalUrl: item.dataLink,
            quality: (item.serverName || "FlixCloud") + " - " + (item.dataType || "stream").toUpperCase()
          });
        }
      } catch (_) {}
    }

    return streams;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [];
  }
}
