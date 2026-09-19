const mangayomiSources = [{
  "name": "Re:ANIME",
  "id": 194820731,
  "lang": "en",
  "baseUrl": "https://reanime.to",
  "apiUrl": "",
  "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://reanime.to/",
  "typeSource": "single",
  "itemType": 1,
  "version": "0.1.2",
  "pkgPath": "anime/src/en/reanime.js",
  "isManga": false,
  "isNsfw": false,
  "hasCloudflare": false,
  "isFullData": true,
  "appMinVerReq": "0.5.0",
  "sourceCodeUrl": "https://raw.githubusercontent.com/SaltWaterWaterMelon/ReAnimeRepo/main/javascript/anime/src/en/reanime.js",
  "dateFormat": "",
  "dateFormatLocale": "",
  "additionalParams": "",
  "sourceCodeLanguage": 1,
  "notes": "Uses Re:ANIME's public HTML pages. The previous direct /api/* implementation was removed because those routes currently return 404."
}];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  get headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "Referer": this.source.baseUrl + "/"
    };
  }

  async fetch(path) {
    const url = path.startsWith("http") ? path : this.source.baseUrl + path;
    const res = await this.client.get(url, this.headers);
    if (!res || !res.body) return null;
    return { url, body: res.body, doc: new Document(res.body) };
  }

  absolute(href) {
    if (!href) return "";
    if (href.startsWith("http")) return href;
    if (href.startsWith("/")) return this.source.baseUrl + href;
    return this.source.baseUrl + "/" + href;
  }

  slugFromHref(href) {
    const m = String(href || "").match(/\/anime\/([^?#/]+)/);
    return m ? m[1] : "";
  }

  imageFromElement(el) {
    if (!el) return "";
    return el.attr("data-src") || el.attr("data-lazy-src") || el.attr("src") || "";
  }

  titleFromCard(card) {
    const selectors = [
      "[title]",
      ".title",
      ".name",
      ".film-name",
      "h2",
      "h3",
      "h4"
    ];
    for (const selector of selectors) {
      const el = card.selectFirst(selector);
      if (!el) continue;
      const title = el.attr("title") || el.text || "";
      if (title.trim()) return title.trim();
    }
    const text = String(card.text || "").trim();
    return text.split("\n").map(x => x.trim()).filter(Boolean)[0] || "";
  }

  parseCards(doc) {
    const out = [];
    const seen = {};
    const anchors = doc.select("a");
    for (const a of anchors) {
      const href = a.attr("href") || "";
      const slug = this.slugFromHref(href);
      if (!slug || seen[slug]) continue;

      let card = a;
      const parent = a.parent;
      if (parent) card = parent;

      let name = this.titleFromCard(card);
      if (!name) name = (a.attr("title") || a.text || "").trim();
      if (!name || name.length > 180) continue;

      let imageUrl = this.imageFromElement(card.selectFirst("img"));
      if (!imageUrl) imageUrl = this.imageFromElement(a.selectFirst("img"));

      seen[slug] = true;
      out.push({
        name: name,
        link: this.absolute("/anime/" + slug),
        imageUrl: this.absolute(imageUrl)
      });
    }
    return out;
  }

  async getList(path) {
    const page = await this.fetch(path);
    if (!page) return [];
    return this.parseCards(page.doc);
  }

  async getPopular(page) {
    const list = await this.getList("/home?page=" + (page || 1));
    return { list: list, hasNextPage: list.length >= 20 };
  }

  async getLatestUpdates(page) {
    const list = await this.getList("/home?page=" + (page || 1));
    return { list: list, hasNextPage: list.length >= 20 };
  }

  async search(query, page) {
    const p = page || 1;
    const encoded = encodeURIComponent(query || "");
    let result = await this.fetch("/search?q=" + encoded + "&page=" + p);
    let list = result ? this.parseCards(result.doc) : [];

    // Keep a fallback for the alternate parameter name used by some builds.
    if (!list.length) {
      result = await this.fetch("/search?query=" + encoded + "&page=" + p);
      list = result ? this.parseCards(result.doc) : [];
    }

    return { list: list, hasNextPage: list.length >= 20 };
  }

  statusCode(status) {
    const s = String(status || "").toLowerCase();
    if (s.indexOf("finished") >= 0 || s.indexOf("complete") >= 0) return 1;
    if (s.indexOf("hiatus") >= 0) return 2;
    if (s.indexOf("upcoming") >= 0 || s.indexOf("not yet") >= 0) return 3;
    if (s.indexOf("cancel") >= 0) return 4;
    if (s.indexOf("releasing") >= 0 || s.indexOf("airing") >= 0 || s.indexOf("current") >= 0) return 0;
    return 5;
  }

  infoText(doc, labels) {
    const nodes = doc.select("body *");
    for (const node of nodes) {
      const text = String(node.text || "").trim();
      for (const label of labels) {
        if (text.toLowerCase().startsWith(label.toLowerCase() + ":")) {
          return text.substring(label.length + 1).trim();
        }
      }
    }
    return "";
  }

  parseGenres(doc) {
    const result = [];
    const text = this.infoText(doc, ["Genres", "Genre"]);
    if (text) {
      text.split(",").forEach(g => {
        const value = g.trim();
        if (value && result.indexOf(value) < 0) result.push(value);
      });
    }
    return result;
  }

  async getDetail(url) {
    let slug = String(url || "")
      .replace(/^https?:\/\/[^/]+\//, "")
      .replace(/^anime\//, "")
      .replace(/^watch\//, "")
      .split("?")[0]
      .replace(/\/$/, "");

    if (!slug) throw new Error("Invalid Re:ANIME URL");

    const page = await this.fetch("/anime/" + encodeURIComponent(slug));
    if (!page) throw new Error("Re:ANIME detail page could not be loaded");

    const doc = page.doc;
    let name = "";
    const titleSelectors = ["h1", "h2", ".title", ".film-name"];
    for (const selector of titleSelectors) {
      const el = doc.selectFirst(selector);
      if (el && String(el.text || "").trim()) {
        name = String(el.text).trim();
        break;
      }
    }

    let imageUrl = "";
    const images = doc.select("img");
    for (const img of images) {
      const src = this.imageFromElement(img);
      if (src && !/logo|avatar|icon/i.test(src)) {
        imageUrl = this.absolute(src);
        break;
      }
    }

    let description = "";
    const descriptionSelectors = [".description", ".synopsis", "[class*='description']", "[class*='synopsis']"];
    for (const selector of descriptionSelectors) {
      const el = doc.selectFirst(selector);
      if (el && String(el.text || "").trim()) {
        description = String(el.text).trim();
        break;
      }
    }

    const chapters = await this.parseEpisodes(slug, doc);
    const status = this.statusCode(this.infoText(doc, ["Status"]));

    return {
      name: name || slug,
      imageUrl: imageUrl,
      description: description,
      genre: this.parseGenres(doc),
      status: status,
      link: this.absolute("/anime/" + slug),
      chapters: chapters
    };
  }

  async parseEpisodes(slug, detailDoc) {
    const result = [];
    const seen = {};

    const collect = (doc) => {
      if (!doc) return;
      const anchors = doc.select("a");
      for (const a of anchors) {
        const href = a.attr("href") || "";
        const match = href.match(new RegExp("/watch/" + slug.replace(/[.*+?^{}()|[\\]\\\\]/g, "\\\\$&") + "\\?ep=([0-9.]+)", "i"));
        if (!match) continue;

        const number = match[1];
        const key = number;
        if (seen[key]) continue;

        let label = (a.text || a.attr("title") || "").trim();
        if (!label) label = "Episode " + number;
        if (!/^episode\\s/i.test(label) && !/^e\\d/i.test(label)) label = "Episode " + number + ": " + label;

        seen[key] = true;
        result.push({
          name: label,
          url: slug + "||" + number
        });
      }
    };

    collect(detailDoc);

    // The episode list is also present on the watch page, which is useful when
    // the /anime page only renders a compact episode count.
    if (!result.length) {
      const watch = await this.fetch("/watch/" + encodeURIComponent(slug) + "?ep=1");
      if (watch) collect(watch.doc);
    }

    result.sort((a, b) => {
      const na = parseFloat(String(a.name).replace(/[^0-9.]/g, "")) || 0;
      const nb = parseFloat(String(b.name).replace(/[^0-9.]/g, "")) || 0;
      return nb - na;
    });

    return result;
  }

  async getVideoList(url) {
    const parts = String(url || "").split("||");
    const slug = parts[0];
    const episode = parts[1];
    if (!slug || !episode) return [];

    const page = await this.fetch("/watch/" + encodeURIComponent(slug) + "?ep=" + encodeURIComponent(episode));
    if (!page) return [];

    const out = [];
    const seen = {};

    // Re:ANIME currently renders third-party server/embed URLs into the watch
    // page. Return those links directly when they are present; do not attempt
    // to decrypt or bypass protected stream layers.
    const add = (u, label) => {
      if (!u || !/^https?:\/\//i.test(u) || seen[u]) return;
      if (!/flixcloud|stream|embed|video|player/i.test(u)) return;
      seen[u] = true;
      out.push({
        url: u,
        originalUrl: u,
        quality: label || "Re:ANIME"
      });
    };

    const anchors = page.doc.select("a");
    for (const a of anchors) {
      const href = a.attr("href") || "";
      const text = String(a.text || a.attr("title") || "").trim();
      add(href, text || "Re:ANIME");
    }

    const iframes = page.doc.select("iframe");
    for (const frame of iframes) {
      add(frame.attr("src") || frame.attr("data-src") || "", "Embedded player");
    }

    // Some server links are serialized in the page as plain JSON/HTML
    // attributes rather than anchors. Pull only obvious HTTP(S) media/embed URLs.
    const body = String(page.body || "");
    const matches = body.match(/https?:\\/\\/[^"'\\s<>\\\\]+/g) || [];
    for (const raw of matches) {
      const u = raw.replace(/&amp;/g, "&");
      add(u, "Re:ANIME");
    }

    return out;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [];
  }
}
