<?xml version="1.0" encoding="UTF-8"?>
<audit version="0.0.179">
<site url="http://127.0.0.1:4173" crawled="8" date="2026-11-12T19:05:00.217Z"/>
<outcome exit-code="0" status="completed" publish="skipped" publish-reason="non-public-host"/>
<render requested="false" mode="http" pages-rendered="0" pages-fetched-plain="8"/>
<score overall="55" grade="F">
 <group name="SEO" score="68" scope="group" errors="1" warnings="61"/>
 <group name="Performance" score="61" scope="group" errors="0" warnings="17"/>
 <group name="Security" score="94" scope="group" errors="0" warnings="3"/>
 <group name="Agents" score="100" scope="group" errors="0" warnings="0"/>
 <cat name="Crawlability" score="78" scope="category"/>
 <cat name="Core SEO" score="42" scope="category"/>
 <cat name="Performance" score="59" scope="category"/>
 <cat name="Content" score="91" scope="category"/>
 <cat name="E-E-A-T" score="57" scope="category"/>
 <cat name="Accessibility" score="99" scope="category"/>
 <cat name="Links" score="90" scope="category"/>
 <cat name="Security" score="95" scope="category"/>
 <cat name="Legal Compliance" score="44" scope="category"/>
 <cat name="Agent Experience" score="100" scope="category"/>
 <cat name="Analytics" score="100" scope="category"/>
 <cat name="Internationalization" score="100" scope="category"/>
 <cat name="Images" score="100" scope="category"/>
 <cat name="Site Integrity" score="100" scope="category"/>
 <cat name="Reliability" score="100" scope="category"/>
 <cat name="Mobile" score="100" scope="category"/>
 <cat name="URL Structure" score="100" scope="category"/>
</score>
<summary passed="906" warnings="91" failed="1"/>
<scan-scope origin="cli" crawled="8" max-pages="100" capped="false"/>
<page-type name="unknown" discovered="7" audited="7"/>
<page-type name="home" discovered="1" audited="1"/>
<audit-level level="surface" based-on="surface" changes="" pages="100"/>
<scripts-evaluated count="4"/>
<rules-cache pages-replayed="0" pages-evaluated="8" disabled-reason="refresh-requested"/>
<technologies source="local">
 <tech name="Bootstrap" cat="other"/>
</technologies>
<issues>
 <rule id="crawl/sitemap-exists" severity="error" category="Crawlability" group="seo" status="fail" docs="https://docs.squirrelscan.com/rules/crawl/sitemap-exists">
  No XML sitemap found
 </rule>
 <rule id="core/twitter-cards" severity="info" category="Core SEO" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/core/twitter-cards">
  No Twitter card or Open Graph tags for Twitter sharing
  Pages (5/8): /, /creator.html, /fixtures.html, /fixtures.html?status=result, /history.html
 </rule>
 <rule id="ax/llms-txt" severity="info" category="Agent Experience" group="ai" status="warn" docs="https://docs.squirrelscan.com/rules/ax/llms-txt">
  No /llms.txt found — consider adding one so AI agents can discover your key content
 </rule>
 <rule id="ax/markdown-response" severity="info" category="Agent Experience" group="ai" status="warn" docs="https://docs.squirrelscan.com/rules/ax/markdown-response">
  No Markdown response — consider honoring Accept: text/markdown or publishing a .md variant so agents get clean content
 </rule>
 <rule id="core/meta-title" severity="warning" category="Core SEO" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/core/meta-title">
  Title too short (21 to 27 chars, min 30)
  Pages (5/6): /creator.html, /fixtures.html, /fixtures.html?status=result, /history.html, /models.html
  Items (5/6):
   - /creator.html (The creator — Calibra (21 chars, under 30)) (from: /creator.html)
   - /fixtures.html (Fixture centre — Calibra (24 chars, under 30)) (from: /fixtures.html)
   - /fixtures.html?status=result (Fixture centre — Calibra (24 chars, under 30)) (from: /fixtures.html?status=result)
   - /history.html (Prediction record — Calibra (27 chars, under 30)) (from: /history.html)
   - /models.html (How it works — Calibra (22 chars, under 30)) (from: /models.html)
 </rule>
 <rule id="core/meta-description" severity="warning" category="Core SEO" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/core/meta-description">
  Description too short (103 to 119 chars, min 120)
  Pages (2): /creator.html, /history.html
  Items (2):
   - /creator.html (Meet the student behind the Calibra La Liga foreca (103 chars, under 120)) (from: /creator.html)
   - /history.html (The archived prediction record: every completed La (119 chars, under 120)) (from: /history.html)
 </rule>
 <rule id="core/canonical" severity="warning" category="Core SEO" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/core/canonical">
  Missing canonical URL
  Pages (5/8): /, /creator.html, /fixtures.html, /fixtures.html?status=result, /history.html
 </rule>
 <rule id="core/og-tags" severity="warning" category="Core SEO" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/core/og-tags">
  Missing og:description; Missing og:image - social shares will lack imagery; Missing og:title
  Pages (5/8): /, /creator.html, /fixtures.html, /fixtures.html?status=result, /history.html
 </rule>
 <rule id="core/robots-meta" severity="warning" category="Core SEO" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/core/robots-meta">
  Page is set to noindex and nofollow via robots meta tag
  Pages (5/8): /, /creator.html, /fixtures.html, /fixtures.html?status=result, /history.html
 </rule>
 <rule id="core/title-unique" severity="warning" category="Core SEO" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/core/title-unique">
  2 duplicate title(s) affecting 4 pages
  Pages (4): /, /fixtures.html, /fixtures.html?status=result, /index.html
  Items (2):
   - calibra — la liga predictions, results and standings (&quot;calibra — la liga predictions, results a...&quot; (2 pages)) [pageCount: 2] (from: /, /index.html)
   - fixture centre — calibra (&quot;fixture centre — calibra...&quot; (2 pages)) [pageCount: 2] (from: /fixtures.html, /fixtures.html?status=result)
 </rule>
 <rule id="security/csp" severity="warning" category="Security" group="security" status="warn" docs="https://docs.squirrelscan.com/rules/security/csp">
  CSP allows &apos;unsafe-inline&apos;
  Pages (1): /
 </rule>
 <rule id="security/security-txt" severity="warning" category="Security" group="security" status="warn" docs="https://docs.squirrelscan.com/rules/security/security-txt">
  No security.txt at /.well-known/security.txt (RFC 9116 vulnerability-disclosure contact)
 </rule>
 <rule id="links/no-contextual-inbound" severity="warning" category="Links" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/links/no-contextual-inbound">
  2 page(s) are linked only from sitewide chrome
  Pages (2): /history.html, /index.html
  Items (2):
   - /history.html (http://127.0.0.1:4173/history.html, linked only from the header and the navigation) [sections: {&quot;header&quot;:8,&quot;navigation&quot;:8}]
   - /index.html (http://127.0.0.1:4173/index.html, linked only from the footer, the header and the navigation) [sections: {&quot;header&quot;:16,&quot;footer&quot;:32,&quot;navigation&quot;:8}]
 </rule>
 <rule id="links/anchor-mismatch" severity="warning" category="Links" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/links/anchor-mismatch">
  6 link pair(s) to 4 page(s) use anchor text that shares no word with the target; for 3 of them it is the only contextual anchor text the page receives
  Pages (4): /, /index.html, /models.html, /performance.html
  Items (5/6):
   - /%20-%3E%20http://127.0.0.1:4173/fixtures.html?status=result (&quot;All results&quot; -&gt; http://127.0.0.1:4173/fixtures.html?status=result (title: &quot;Fixture centre — Calibra&quot;), the only contextual anchor text this page receives) (from: /)
   - /%20-%3E%20http://127.0.0.1:4173/performance.html (&quot;See the full record&quot; -&gt; http://127.0.0.1:4173/performance.html (title: &quot;Performance — Calibra&quot;), the only contextual anchor text this page receives) (from: /)
   - /index.html%20-%3E%20http://127.0.0.1:4173/fixtures.html?status=result (&quot;All results&quot; -&gt; http://127.0.0.1:4173/fixtures.html?status=result (title: &quot;Fixture centre — Calibra&quot;), the only contextual anchor text this page receives) (from: /index.html)
   - /index.html%20-%3E%20http://127.0.0.1:4173/performance.html (&quot;See the full record&quot; -&gt; http://127.0.0.1:4173/performance.html (title: &quot;Performance — Calibra&quot;), the only contextual anchor text this page receives) (from: /index.html)
   - /models.html%20-%3E%20http://127.0.0.1:4173/creator.html (&quot;Who makes it&quot; -&gt; http://127.0.0.1:4173/creator.html (title: &quot;The creator — Calibra&quot;), the only contextual anchor text this page receives) (from: /models.html)
 </rule>
 <rule id="content/duplicate-title" severity="warning" category="Content" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/content/duplicate-title">
  2 duplicate title(s) found across 4 pages
  Pages (4): /, /fixtures.html, /fixtures.html?status=result, /index.html
  Items (2):
   - calibra — la liga predictions, results and standings (&quot;calibra — la liga predictions, results a...&quot; (2 pages)) [pageCount: 2] (from: /, /index.html)
   - fixture centre — calibra (&quot;fixture centre — calibra...&quot; (2 pages)) [pageCount: 2] (from: /fixtures.html, /fixtures.html?status=result)
 </rule>
 <rule id="content/duplicate-description" severity="warning" category="Content" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/content/duplicate-description">
  2 duplicate description(s) found across 4 pages
  Pages (4): /, /fixtures.html, /fixtures.html?status=result, /index.html
  Items (2):
   - browse real la liga fixtures by club, matchweek and status.  (&quot;browse real la liga fixtures by club, ma...&quot; (2 pages)) [pageCount: 2] (from: /fixtures.html, /fixtures.html?status=result)
   - la liga 2026/27: the next fixture with its predicted scoreli (&quot;la liga 2026/27: the next fixture with i...&quot; (2 pages)) [pageCount: 2] (from: /, /index.html)
 </rule>
 <rule id="content/keyword-stuffing" severity="warning" category="Content" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/content/keyword-stuffing">
  1 word(s) may be overused
  Pages (2): /, /index.html
  Items (1):
   - results (&quot;results&quot; (4.9%)) [count: 7, density: 4.929577464788732] (from: /, /index.html)
 </rule>
 <rule id="perf/js-file-size" severity="warning" category="Performance" group="performance" status="warn" docs="https://docs.squirrelscan.com/rules/perf/js-file-size">
  1 JS file(s) exceed 250.0 KB
  Pages (5/8): /, /creator.html, /fixtures.html, /fixtures.html?status=result, /history.html
  Site-wide (8 of 8 pages): /api/bootstrap.js
 </rule>
 <rule id="perf/critical-request-chains" severity="warning" category="Performance" group="performance" status="warn" docs="https://docs.squirrelscan.com/rules/perf/critical-request-chains">
  2 critical request chain(s) found
  Pages (5/8): /, /creator.html, /fixtures.html, /fixtures.html?status=result, /history.html
  Site-wide (8 of 8 pages): CSS: assets/css/concept.css?v=10
  Site-wide (8 of 8 pages): JS: /api/bootstrap.js
 </rule>
 <rule id="perf/unminified-js" severity="warning" category="Performance" group="performance" status="warn" docs="https://docs.squirrelscan.com/rules/perf/unminified-js">
  3 JavaScript file(s) appear unminified
  Pages (5/8): /, /creator.html, /fixtures.html, /fixtures.html?status=result, /history.html
  Site-wide (8 of 8 pages): 75.8KB, ~15.4KB savings
  Site-wide (8 of 8 pages): 8.1KB, ~1.5KB savings
  Site-wide (8 of 8 pages): 12.1KB, ~2.2KB savings
 </rule>
 <rule id="a11y/th-has-data-cells" severity="warning" category="Accessibility" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/a11y/th-has-data-cells">
  4 &lt;th&gt; element(s) without associated data cells; 6 &lt;th&gt; element(s) without associated data cells
  Pages (3): /, /index.html, /performance.html
  Items (5/10):
   - Bookmaker RPS (from: /performance.html)
   - Calibra RPS (from: /performance.html)
   - Gap (from: /performance.html)
   - Season (from: /performance.html)
   - Club (from: /, /index.html)
 </rule>
 <rule id="eeat/about-page" severity="warning" category="E-E-A-T" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/eeat/about-page">
  No About page found
 </rule>
 <rule id="eeat/contact-page" severity="warning" category="E-E-A-T" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/eeat/contact-page">
  No Contact page found
 </rule>
 <rule id="eeat/privacy-policy" severity="warning" category="E-E-A-T" group="seo" status="warn" docs="https://docs.squirrelscan.com/rules/eeat/privacy-policy">
  No Privacy Policy page found
 </rule>
 <rule id="legal/privacy-policy" severity="warning" category="Legal Compliance" group="security" status="warn" docs="https://docs.squirrelscan.com/rules/legal/privacy-policy">
  No privacy policy link found across site
 </rule>
</issues>
<not-applicable reason="private-target" count="9">
 Local or private-network host: 9 transport and delivery rules do not apply here and are not scored (Cache Headers, Compression, HSTS Header, HTTP to HTTPS Redirect, HTTP/2, HTTPS, TLS Certificate, Uncompressed Assets, Weak Caching (site-wide)).
 <rule id="perf/cache-headers" name="Cache Headers"/>
 <rule id="perf/compression" name="Compression"/>
 <rule id="security/hsts" name="HSTS Header"/>
 <rule id="security/http-to-https" name="HTTP to HTTPS Redirect"/>
 <rule id="perf/http2" name="HTTP/2"/>
 <rule id="security/https" name="HTTPS"/>
 <rule id="security/tls-certificate" name="TLS Certificate"/>
 <rule id="perf/asset-compression" name="Uncompressed Assets"/>
 <rule id="perf/bad-caching" name="Weak Caching (site-wide)"/>
</not-applicable>
<entities count="0" references="0" dangling="0" conflicts="0" without-id="0" stable-id-share="0" pages-without-entities="8">
</entities>
<report-detail>
 <page-structure pages="8" links="179" chrome-share="0.935">
  Page types: 2 homepages; 6 not classified.
  94% of internal links sit in the header, footer, navigation and sidebar; 6% in the page content.
  179 links counted.
  <section name="footer" pages="8" links="72"/>
  <section name="header" pages="8" links="54"/>
  <section name="navigation" pages="8" links="41"/>
  <section name="content" pages="5" links="12"/>
 </page-structure>
</report-detail>
</audit>