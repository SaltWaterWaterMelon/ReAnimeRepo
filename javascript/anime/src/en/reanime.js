const mangayomiSources = [{
  "name": "Re:ANIME",
  "lang": "en",
  "baseUrl": "https://reanime.to",
  "apiUrl": "",
  "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://reanime.to/",
  "typeSource": "multi",
  "itemType": 1,
  "version": "0.1.1",
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
      "Accept": "application/json, text/plain, */*",
      "Referer": this.source.baseUrl + "/"
    });
    if (!res || res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error("Re:ANIME API request failed: " + (res && res.statusCode || "no response") + " (" + url + ")");
    }
    try {
      return JSON.parse(res.body);
    } catch (_) {
      throw new Error("Re:ANIME returned non-JSON for " + url);
    }
  }

  unwrap(data, keys) {
    if (Array.isArray(data)) return data;
    for (const key of keys) if (data && Array.isArray(data[key])) return data[key];
    return [];
  }

  titleOf(a) {
    if (!a) return "Unknown";
    if (typeof a.title === "string") return a.title;
    if (a.title) return a.title.english || a.title.romaji || a.title.native ||
      Object.values(a.title).find(x => typeof x === "string") || "Unknown";
    return a.name || a.title_english || a.title_romaji || "Unknown";
  }

  imageOf(a) {
    if (!a) return "";
    if (typeof a.cover_image === "string") return a.cover_image;
    if (a.cover_image) return a.cover_image.extra_large || a.cover_image.large || a.cover_image.medium || "";
    if (typeof a.coverImage === "string") return a.coverImage;
    if (a.coverImage) return a.coverImage.extraLarge || a.coverImage.large || a.coverImage.medium || "";
    return a.image || a.poster || "";
  }

  slugOf(a) {
    return String(a && (a.slug || a.id || a.anime_id || a.uid || a.identifier || "")).replace(/^.*\/watch\//, "");
  }

  list(data) {
    return this.unwrap(data, ["data", "results", "anime", "items"]).map(a => ({
      name: this.titleOf(a),
      link: this.slugOf(a),
      imageUrl: this.imageOf(a)
    }));
  }

  async getPopular(page) {
    const data = await this.api("/api/top/anime", {
      period: "week", limit: 20, offset: Math.max(0, ((page || 1) - 1) * 20)
    });
    const list = this.list(data);
    return { list, hasNextPage: list.length >= 20 };
  }

  async getLatestUpdates(page) {
    const data = await this.api("/api/home/latest-aired", {
      limit: 20, offset: Math.max(0, ((page || 1) - 1) * 20)
    });
    const list = this.list(data);
    return { list, hasNextPage: list.length >= 20 };
  }

  async search(query, page) {
    const data = await this.api("/api/search", {
      q: query, limit: 20, offset: Math.max(0, ((page || 1) - 1) * 20)
    });
    const list = this.list(data);
    return { list, hasNextPage: list.length >= 20 };
  }

  statusCode(status) {
    switch (String(status || "").toUpperCase()) {
      case "RELEASING": case "CURRENT": case "AIRING": return 0;
      case "FINISHED": case "FINISHED_AIRING": return 1;
      case "HIATUS": return 2;
      case "NOT_YET_RELEASED": case "UPCOMING": return 3;
      case "CANCELLED": return 4;
      default: return 5;
    }
  }

  async getDetail(url) {
    const slug = String(url).replace(/^.*\/watch\//, "").replace(/^.*\//, "");
    const data = await this.api("/api/episodes/" + encodeURIComponent(slug));
    const episodes = this.unwrap(data, ["data", "episodes", "results"]);
    let anime = data && data.anime;
    if (!anime) {
      try {
        const first = await this.api("/api/watch/" + encodeURIComponent(slug) + "/1");
        anime = first && first.anime;
      } catch (_) {}
    }

    const chapters = episodes.map(ep => {
      const n = ep.number ?? ep.episode ?? ep.episodeNumber ?? ep.ep ?? 0;
      const title = ep.title || ep.name || "";
      return { name: "E" + n + (title ? ": " + title : ""), url: slug + "||" + n };
    }).sort((a,b) => (parseFloat(b.name.slice(1)) || 0) - (parseFloat(a.name.slice(1)) || 0));

    return {
      name: this.titleOf(anime) || slug,
      imageUrl: this.imageOf(anime),
      description: anime && (anime.description || anime.synopsis || "") || "",
      genres: anime && Array.isArray(anime.genres) ? anime.genres : [],
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

    return links.filter(x => x && x.dataLink).map(x => ({
      url: x.dataLink,
      originalUrl: x.dataLink,
      quality: (x.serverName || "Re:ANIME") + " - " + String(x.dataType || "stream").toUpperCase()
    }));
  }

  getFilterList() { return []; }
  getSourcePreferences() { return []; }
}
