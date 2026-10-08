(async () => {
  const REPO = "SimphiweNkabinde/master-resume-cms";
  const API = `https://api.github.com/repos/${REPO}/contents`;
  const CACHE_MINUTES = 10; // avoids GitHub's unauthenticated rate limit (60 requests/hour)
  const app = document.getElementById("app");

  // ---------- helpers ----------
  const esc = (s = "") =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  const parse = (text) => {
    const opts = { schema: jsyaml.JSON_SCHEMA }; // keeps dates as strings
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fm) return { ...(jsyaml.load(fm[1], opts) || {}), body: fm[2].trim() };
    return jsyaml.load(text, opts) || {};
  };

  const fmtDate = (d) =>
    d
      ? new Date(d).toLocaleDateString("en-GB", {
          month: "short",
          year: "numeric",
        })
      : "";
  const range = (start, end) =>
    `${fmtDate(start)} – ${end ? fmtDate(end) : "Present"}`;
  const byDateDesc = (key) => (a, b) =>
    new Date(b[key] || "9999-12-31") - new Date(a[key] || "9999-12-31");
  const link = (url, label) =>
    url
      ? `<a href="${esc(url)}" class="text-blue-700 hover:underline print:text-inherit">${esc(label)}</a>`
      : "";

  const fetchJSON = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return res.json();
  };
  const fetchText = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return res.text();
  };

  // ---------- data loading ----------
  async function loadCollection(name) {
    const files = await fetchJSON(`${API}/content/${name}`);
    return Promise.all(
      files
        .filter((f) => f.type === "file" && /\.(md|ya?ml|json)$/i.test(f.name))
        .map(async (f) => ({
          slug: f.name.replace(/\.[^.]+$/, ""),
          ...parse(await fetchText(f.download_url)),
        })),
    );
  }

  async function loadAll() {
    const cached = sessionStorage.getItem("resume-data");
    if (cached) {
      const { time, data } = JSON.parse(cached);
      if (Date.now() - time < CACHE_MINUTES * 60 * 1000) return data;
    }
    const profileMeta = await fetchJSON(`${API}/content/profile.yaml`);
    const [profile, skills, education, experience, certifications] =
      await Promise.all([
        fetchText(profileMeta.download_url).then(parse),
        loadCollection("skills"),
        loadCollection("education"),
        loadCollection("experience"),
        loadCollection("certifications"),
      ]);
    const data = { profile, skills, education, experience, certifications };
    try {
      sessionStorage.setItem(
        "resume-data",
        JSON.stringify({ time: Date.now(), data }),
      );
    } catch {}
    return data;
  }

  // ---------- rendering ----------
  const section = (title, html) =>
    html.trim()
      ? `<section>
           <h2 class="mb-3 mt-9 border-b-2 border-zinc-200 pb-1 text-sm font-semibold uppercase tracking-wider">${title}</h2>
           ${html}
         </section>`
      : "";

  const chipStyles = {
    strong: "border-blue-200 bg-blue-50",
    working: "border-zinc-200",
    familiar: "border-zinc-200 text-zinc-500",
  };

  function render({ profile, skills, education, experience, certifications }) {
    education = [...education].sort(byDateDesc("startdate"));
    experience = [...experience].sort(byDateDesc("startdate"));
    certifications = [...certifications].sort(byDateDesc("issue_date"));
    const skillsBySlug = Object.fromEntries(skills.map((s) => [s.slug, s]));
    const proficiencyOrder = ["strong", "working", "familiar"];

    document.title = `${profile.firstname} ${profile.lastname} — Master Resume`;

    const header = `
      <header>
        <h1 class="text-3xl font-bold">${esc(profile.firstname)} ${esc(profile.lastname)}</h1>
        <p class="mt-1 text-lg text-zinc-500">${esc(profile.professional_title)}</p>
        <p class="mt-1">${[
          link(profile.linkedin_url, "LinkedIn"),
          link(profile.github_url, "GitHub"),
        ]
          .filter(Boolean)
          .join(' <span class="text-zinc-400">·</span> ')}</p>
      </header>`;

    const row = (title, dates) => `
      <div class="flex flex-wrap justify-between gap-x-4">
        <h3 class="font-semibold capitalize">${esc(title)}</h3>
        <span class="whitespace-nowrap text-sm text-zinc-500">${dates}</span>
      </div>`;
    const meta = (html) => `<p class="text-sm text-zinc-500">${html}</p>`;

    const experienceHtml = experience
      .map(
        (e) => `
      <article class="mb-4">
        ${row(e.job_title, range(e.startdate, e.enddate))}
        ${meta([e.organization, e.location, e.location_type, e.employment_type].filter(Boolean).map(esc).join(" · "))}
        ${e.body ? `<p class="mt-1">${esc(e.body)}</p>` : ""}
      </article>`,
      )
      .join("");

    const educationHtml = education
      .map((e) => {
        const related = (e.skills || [])
          .map((s) => skillsBySlug[s]?.name)
          .filter(Boolean);
        return `
      <article class="mb-4">
        ${row(e.qualification, range(e.startdate, e.enddate))}
        ${meta(esc(e.institution))}
        ${related.length ? meta(`<strong>Skills</strong>: ${related.map(esc).join(", ")}`) : ""}
        ${e.media ? meta(link(e.media, "Attachment")) : ""}
      </article>`;
      })
      .join("");

    const domains = [...new Set(skills.map((s) => s.domain))].sort();
    const skillsHtml = domains
      .map((domain) => {
        const items = skills
          .filter((s) => s.domain === domain)
          .sort(
            (a, b) =>
              proficiencyOrder.indexOf(a.proficiency) -
                proficiencyOrder.indexOf(b.proficiency) ||
              a.name.localeCompare(b.name),
          )
          .map(
            (s) =>
              `<span title="${esc(s.proficiency)}" class="mr-1.5 mt-1 inline-block rounded-full border px-2.5 py-0.5 text-sm ${chipStyles[s.proficiency] || chipStyles.working}">${esc(s.name)}</span>`,
          )
          .join("");
        return `
      <div class="mb-3">
        <h3 class="text-sm font-semibold capitalize">${esc(domain)}</h3>
        <div>${items}</div>
      </div>`;
      })
      .join("");

    const certsHtml = certifications
      .map(
        (c) => `
      <article class="mb-4">
        ${row(c.name, fmtDate(c.issue_date) + (c.expiration_date ? " – " + fmtDate(c.expiration_date) : ""))}
        ${meta(
          esc(c.issuing_organization) +
            (c.credential_id ? " · ID: " + esc(c.credential_id) : "") +
            (c.credential_url ? " · " + link(c.credential_url, "Verify") : "") +
            (c.media ? " · " + link(`/public${c.media}`, "Attachment") : ""),
        )}
      </article>`,
      )
      .join("");

    app.innerHTML = [
      header,
      section("Work Experience", experienceHtml),
      section("Education", educationHtml),
      section(
        "Skills",
        skillsHtml +
          '<p class="text-xs text-zinc-500">Highlighted = strong · outlined = working · grey = familiar</p>',
      ),
      section("Certifications &amp; Professional Development", certsHtml),
    ].join("");
  }

  // ---------- go ----------
  try {
    render(await loadAll());
  } catch (err) {
    console.error(err);
    app.innerHTML = `<p class="text-red-700">Couldn't load resume content: ${esc(err.message)}</p>`;
  }
})();
