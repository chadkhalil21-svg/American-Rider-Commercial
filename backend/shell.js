// The one page shell every American Rider web page is built from.
//
// WHY THIS EXISTS. The legal pages carried their own copy of the styling, and it had drifted
// from the app: paper #F6F5F1 against the app's #F7F7F5, borders #ECEAE4 against #ECEBE6,
// muted #9BA0AC against #8A8A82, cards at radius 20 against the app's 16 — and a tagline
// reading "SAFE. RELIABLE. AMERICAN." where every screen in the app says NATIONAL
// TRANSPORTATION. Brand-coloured, in the wrong colours, saying a different thing.
//
// The values below are src/theme.ts, hex for hex. When the app's tokens change, change them
// here too — there is no third place.
const T = {
  paper: '#F7F7F5',
  ink: '#14171F',
  hairline: '#ECEBE6',
  border: '#E3E2DC',
  muted: '#8A8A82',
  faint: '#B4B3AB',
  blue: '#2E5FE0',
  blueTint: '#F0F3FD',
  blueBorder: '#DCE4FA',
};

// The wordmark is the way home, so the nav does not repeat it.
//
// SMART TRAVEL IS NOT IN HERE, AND IS NOT IN THE FOOTER EITHER. It sat beside Terms and
// Privacy, which told a reader it was a legal footnote rather than something the company
// offers. It is a kind of travel, so it is reached from Travel and from the home page, both
// of which give it a card rather than a line of small print. Four items hold one line at
// 375px; five did not.
const NAV = [
  { href: '/travel', label: 'Travel' },
  { href: '/operate', label: 'Operate' },
  { href: '/safety', label: 'Safety' },
  { href: '/support', label: 'Support' },
];

/**
 * @param title    browser title, before the wordmark
 * @param bodyHtml the page content
 * @param active   href of the current page, so the nav can mark it
 */
function page(title, bodyHtml, active = '') {
  const nav = NAV.map(
    (n) =>
      `<a class="nav${n.href === active ? ' on' : ''}" href="${n.href}">${n.label}</a>`,
  ).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title === 'American Rider' ? title : `${title} — American Rider`}</title>
<style>
  /* src/theme.ts, hex for hex. Cards: white, radius 16, 1px hairline, NO shadow.
     Mono is ONLY ever used for amounts and travel numbers, exactly as in the app. */
  :root {
    --paper:${T.paper}; --ink:${T.ink}; --hairline:${T.hairline}; --border:${T.border};
    --muted:${T.muted}; --faint:${T.faint}; --blue:${T.blue};
    --blue-tint:${T.blueTint}; --blue-border:${T.blueBorder};
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink);
    font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    line-height:1.6; letter-spacing:-0.005em; -webkit-font-smoothing:antialiased; }
  main { max-width:680px; margin:0 auto; padding:44px 24px 64px; }

  /* Letterhead: hamburger-free on the web, but the same lockup and the same tagline. */
  a.lockup { display:block; text-decoration:none; color:inherit; }
  .brand { text-align:center; font-size:13px; font-weight:600; letter-spacing:4px; }
  .tagline { text-align:center; font-size:10.5px; font-weight:600; letter-spacing:2px;
    color:var(--muted); margin-top:7px; }

  nav { display:flex; flex-wrap:wrap; justify-content:center; gap:18px;
    margin-top:30px; padding-bottom:24px; border-bottom:1px solid var(--hairline); }
  a.nav { font-size:13.5px; color:var(--muted); text-decoration:none; }
  a.nav.on { color:var(--ink); font-weight:600; }
  a.nav:hover { color:var(--ink); }

  h1 { font-size:34px; font-weight:600; letter-spacing:-0.68px; margin:44px 0 10px; }
  .lede { font-size:16.5px; color:var(--muted); margin:0 0 6px; }
  .updated { color:var(--faint); font-size:12.5px; margin:0 0 22px;
    font-family:ui-monospace,"SF Mono",Menlo,monospace; letter-spacing:0.4px; }

  section { background:#fff; border:1px solid var(--hairline); border-radius:16px;
    padding:20px 22px; margin-top:14px; }
  h2 { font-size:11px; font-weight:600; letter-spacing:1.65px; text-transform:uppercase;
    color:var(--muted); margin:0 0 12px; }
  h3 { font-size:16px; font-weight:600; margin:0 0 6px; letter-spacing:-0.2px; }
  p, li { font-size:15px; margin:0 0 10px; }
  li { margin-bottom:8px; }
  p:last-child, li:last-child { margin-bottom:0; }
  ul { padding-left:20px; margin:0; }
  a { color:var(--blue); }

  .panel { background:var(--blue-tint); border:1px solid var(--blue-border);
    border-radius:16px; padding:16px 18px; font-size:14.5px; line-height:1.55; }

  /* THE WELCOME. A page that opens on a card opens on business; an institution introduces
     itself first. There is no photography to do that with, so it is done with scale and air —
     the name set large, one line of purpose, and a great deal of space around both. The
     entrance is a single quiet rise, once, on the opening only: enough to feel considered,
     far short of a performance. Anyone who has asked their system not to animate gets the
     page still. */
  .hero { text-align:center; padding:78px 8px 66px; }
  .hero .name { font-size:54px; font-weight:600; letter-spacing:-1.2px; line-height:1.03; }
  .hero .line { font-size:18px; color:var(--muted); margin:20px auto 0; max-width:30rem;
    line-height:1.5; }
  .hero .rule { width:44px; height:1px; background:var(--border); margin:34px auto 0; }
  @media (max-width:560px) {
    .hero { padding:56px 4px 48px; }
    .hero .name { font-size:40px; letter-spacing:-0.9px; }
    .hero .line { font-size:16.5px; margin-top:16px; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .hero .name, .hero .line, .hero .rule { animation: rise .5s cubic-bezier(.2,.7,.3,1) both; }
    .hero .line { animation-delay: .06s; }
    .hero .rule { animation-delay: .12s; }
    @keyframes rise { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
  }

  /* THE STATEMENT. The founders' own demo states the figure that matters this way — a
     centred blue-tinted card, a quiet blue label above, and the number itself set large in
     mono. It is the house idiom for "this is the thing", and the site earns its authority by
     opening with the principle rather than with a price list. */
  .statement { background:var(--blue-tint); border:1px solid var(--blue-border);
    border-radius:16px; padding:30px 22px 26px; margin-top:26px; text-align:center; }
  .statement .lbl { font-size:11px; font-weight:600; letter-spacing:1.65px;
    text-transform:uppercase; color:var(--blue); }
  .statement .figure { font-family:ui-monospace,"SF Mono",Menlo,monospace; font-size:46px;
    font-weight:600; letter-spacing:0.06em; margin-top:14px; line-height:1; }
  .statement .note { font-size:14.5px; color:var(--muted); margin-top:12px; }

  /* A rule between the two halves of one table, where the second half is the consequence
     of the first. Heavier than a row hairline, quieter than a new card. */
  .rows .split { border-top:1px solid var(--border); margin-top:4px; padding-top:17px; }
  .rows > div { display:flex; justify-content:space-between; gap:14px;
    padding:13px 0; border-top:1px solid var(--hairline); }
  .rows > div:first-child { border-top:0; }
  .rows .k { color:var(--muted); font-size:14.5px; }
  .mono { font-family:ui-monospace,"SF Mono",Menlo,monospace; }
  .amount { font-family:ui-monospace,"SF Mono",Menlo,monospace; font-size:15px; }

  /* The app points onward with a blue label and a chevron — "Select ›", "View profile ›".
     The site uses the same idiom rather than inventing a second one. */
  .more { display:inline-block; color:var(--blue); font-weight:500; font-size:15px;
    text-decoration:none; margin-top:12px; }

  .cta { display:inline-block; background:var(--ink); color:#fff; text-decoration:none;
    font-size:16px; font-weight:600; letter-spacing:0.16px; padding:14px 22px;
    border-radius:13px; margin-top:16px; }
  .ghost { display:inline-block; border:1px solid var(--border); color:var(--ink);
    text-decoration:none; font-size:16px; font-weight:600; padding:13px 21px;
    border-radius:13px; margin-top:16px; }

  .foot { text-align:center; margin-top:34px; color:var(--muted); font-size:12.5px;
    line-height:1.7; }
  .foot .stamp { font-family:ui-monospace,"SF Mono",Menlo,monospace; font-size:11.5px;
    letter-spacing:1px; color:var(--faint); }
  .foot a { color:var(--muted); }

/* Public experience, Oct 2026: mobile-first, fast, keyboard-friendly and quiet.
   Inherits the source-of-truth brand colors in :root above. No remote fonts or images. */
html{scroll-behavior:smooth}
body{min-width:280px}
.skip-link{position:absolute;top:-80px;left:14px;padding:12px 16px;background:var(--ink);color:#fff;z-index:100;border-radius:8px}
.skip-link:focus{top:12px}
.site-header{border-bottom:1px solid var(--hairline);background:rgba(247,247,245,.98)}
.header-inner{max-width:1160px;margin:auto;display:flex;justify-content:space-between;align-items:center;gap:26px;padding:24px 28px}
.site-header .lockup{flex:none;min-width:175px}
.site-header .brand{text-align:left;font-size:15px;letter-spacing:.17em}
.site-header .tagline{text-align:left;letter-spacing:.16em;font-size:9px;margin-top:5px}
.site-header nav{border:0;margin:0;padding:0;display:flex;justify-content:flex-end;gap:8px 24px}
.site-header nav .nav{font-size:13px;color:#505763;padding:9px 2px;white-space:nowrap;text-underline-offset:6px}
.site-header nav .nav.on{color:var(--ink);text-decoration:underline;text-decoration-color:var(--blue);text-decoration-thickness:2px}
.site-header nav .nav:hover{color:var(--ink)}
.site-main{max-width:1160px;margin:auto;padding:26px 28px 64px;min-height:65vh}
.site-main>h1,.site-main>.lede,.site-main>.updated{max-width:760px}
.site-main>h1{font-size:clamp(31px,5vw,50px);letter-spacing:-.055em;line-height:1.13;margin:58px 0 14px}
.site-main>.lede{font-size:18px;max-width:650px;line-height:1.6;margin-bottom:32px}
.site-main>section:not(.hero-grid),.site-main>.statement{max-width:830px;margin-left:auto;margin-right:auto}
.site-main>section{padding:24px 28px}
.site-main>section h2{color:#606774}
.site-main>section p{max-width:68ch;line-height:1.72}
.site-main p{line-height:1.68}
.site-main .statement{padding:34px 24px}
.site-main .figure{font-size:clamp(46px,7vw,66px)}
.site-main .hero-grid{background:transparent;border:0;padding:70px 0 64px;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(300px,.92fr);align-items:center;gap:48px;max-width:none}
.site-main .hero-grid p{max-width:57ch}
.eyebrow{font-size:11px;font-weight:680;letter-spacing:.17em;text-transform:uppercase;color:#677186;margin-bottom:16px}
.hero-heading{font-size:clamp(48px,6.8vw,88px);font-weight:590;letter-spacing:-.072em;line-height:.99;max-width:640px;margin:0 0 25px}
.hero-heading span{color:#5e687b}
.hero-lede{font-size:clamp(17px,1.8vw,20px);color:#4b5361;line-height:1.6;margin-bottom:28px}
.button-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.button-row .cta,.button-row .ghost{margin:0;min-height:49px;display:inline-flex;align-items:center;justify-content:center;font-size:14px;line-height:1.3}
.button-row .ghost{background:transparent}
.button-row .cta:hover{background:#2c3646}
.button-row .ghost:hover{background:#fff}
.path-card{min-height:390px;position:relative;background:#e9edf1;border:1px solid #dfe5ea;border-radius:18px;overflow:hidden;padding:22px;isolation:isolate}
.path-card:before{content:"";position:absolute;width:72%;height:75%;right:-20%;top:-40%;border-radius:50%;background:#f8fafb;filter:blur(30px);opacity:.75;z-index:-1}
.path-card svg{width:100%;height:270px;display:block}
.path-label{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#51627a;font-size:11px;letter-spacing:.13em;font-weight:640;text-transform:uppercase}
.path-caption{font-size:15px;font-weight:550;letter-spacing:-.02em;color:#1d3049;margin:2px 0 0}
.feature-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:0 0 28px}
.feature-strip section{margin:0;background:#fff;border:1px solid var(--hairline);border-radius:16px;padding:24px}
.feature-strip h2{font-size:18px;letter-spacing:-.035em;text-transform:none;color:var(--ink);margin:0 0 13px}
.feature-strip p{color:#4b5565;font-size:14px;min-height:68px;margin:0}
.feature-strip .more{font-size:14px;font-weight:580}
.number{font:600 11px ui-monospace,"SF Mono",monospace;letter-spacing:.05em;color:#728097;margin:0 0 24px}
.divider-label{font-size:12px;text-transform:uppercase;letter-spacing:.17em;color:#687285;margin:38px 0 13px}
.service-panel{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:29px 32px;background:#101e34;color:#fff;border-radius:16px}
.service-panel h2{font-size:22px;color:#fff;text-transform:none;letter-spacing:-.035em;margin:0 0 9px}
.service-panel p{font-size:14px;color:#cad4df;max-width:60ch;margin:0}
.service-panel a{color:#fff;text-decoration:underline;text-underline-offset:6px;white-space:nowrap;font-size:14px}
.site-footer{max-width:1160px;margin:auto;padding:24px 28px 42px;border-top:1px solid var(--hairline)}
.site-footer .foot{text-align:left;margin:0;line-height:2}
.site-footer .foot a{color:#4a5365;text-underline-offset:4px}
.site-footer .foot .stamp{color:#89919f}
a:focus-visible,button:focus-visible{outline:3px solid var(--blue);outline-offset:4px;border-radius:4px}
@media(max-width:850px){
  .site-main .hero-grid{grid-template-columns:minmax(0,1fr);gap:26px;padding:48px 0 35px}
  .path-card{min-height:300px}.path-card svg{height:200px}
  .feature-strip{grid-template-columns:1fr}.feature-strip p{min-height:0}
  .service-panel{align-items:flex-start;flex-direction:column}
}
@media(max-width:590px){
  .header-inner{padding:18px 20px;display:block}
  .site-header .lockup{display:block}
  .site-header nav{margin-top:14px;justify-content:space-between;gap:4px;overflow-x:auto}
  .site-header nav .nav{font-size:12px;padding:9px 1px}
  .site-main{padding:16px 20px 52px}
  .site-main>h1{margin-top:36px}
  .site-main>section{padding:20px}
  .site-main .hero-grid{padding:37px 0 28px}
  .hero-heading{font-size:clamp(43px,12vw,62px)}
  .path-card{min-height:250px;padding:18px}
  .path-card svg{height:170px}
  .service-panel{padding:24px}
  .site-footer{padding:22px 20px 35px}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{animation:none!important;transition:none!important}}


/* Founder-directed editorial system. All buttons are real links; no fake booking. */
:root{--ar-night:#132238;--ar-slate:#536174}
.site-header{background:#f7f7f5;border-bottom:1px solid #e1e4e5}
.header-inner,.site-main,.site-footer{max-width:1320px}
.site-header .brand{font-weight:740;letter-spacing:.26em}
.site-header .tagline{letter-spacing:.22em}
.site-main{padding-top:0}
.site-main .ar-hero{max-width:none;display:grid;grid-template-columns:1.04fr .96fr;align-items:stretch;gap:clamp(24px,5vw,76px);padding:clamp(45px,6vw,88px) 0 clamp(60px,7vw,105px);background:transparent;border:0}
.ar-hero-copy{display:flex;flex-direction:column;justify-content:center;padding:14px 0 22px}
.ar-kicker{font-size:11px;font-weight:720;letter-spacing:.18em;color:#677184;text-transform:uppercase;margin:0 0 25px}
.ar-display{font-size:clamp(62px,8vw,114px);line-height:.96;font-weight:530;letter-spacing:-.075em;margin:0 0 32px;color:#172031}
.ar-display em{font-style:normal;color:#646f80}
.ar-lead{font-size:clamp(18px,1.8vw,23px);line-height:1.55;max-width:28em;color:#455164;margin:0 0 34px}
.ar-actions{display:flex;align-items:center;flex-wrap:wrap;gap:14px 28px;margin-bottom:30px}
.ar-actions a,.ar-offerings a,.ar-vision a,.ar-outline{text-decoration:none;font-weight:630;text-underline-offset:6px}
.ar-primary{background:#142238;color:#fff!important;display:inline-flex;align-items:center;justify-content:space-between;gap:30px;padding:17px 23px;min-height:54px;border-radius:4px}
.ar-primary:hover{background:#263b56}
.ar-textlink{color:#1e334c;border-bottom:1px solid #b0bcc9;display:inline-flex;align-items:center;gap:24px;min-height:46px}
.ar-smallnote{font-size:13px;color:#697587;line-height:1.65;max-width:36em}
.ar-photo{margin:0;position:relative;min-height:580px;overflow:hidden;background:linear-gradient(135deg,#253448,#76838c);border-radius:4px}
.ar-photo img{width:100%;height:100%;min-height:580px;object-fit:cover;object-position:center;display:block;filter:saturate(.72) contrast(1.05)}
.ar-photo:after{content:"";position:absolute;inset:55% 0 0;pointer-events:none;background:linear-gradient(transparent,rgba(7,14,26,.7))}
.ar-photo figcaption{position:absolute;z-index:1;left:24px;right:24px;bottom:22px;display:flex;justify-content:space-between;gap:12px;color:#fff;font-size:10px;font-weight:700;letter-spacing:.15em}
.site-main .ar-manifesto{max-width:none;margin:0 0 66px;padding:12px 0 26px;background:transparent;border:0;display:grid;grid-template-columns:.8fr 2.7fr 1.4fr;gap:24px;align-items:start}
.ar-manifesto .ar-kicker{padding-top:12px}
.site-main .ar-manifesto h2{font-size:clamp(32px,3.4vw,48px);line-height:1.13;font-weight:560;letter-spacing:-.055em;margin:0;color:#162235}
.ar-manifesto p:last-child{font-size:15px;line-height:1.75;color:#596579;margin:0}
.site-main .ar-offerings{max-width:none;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));padding:0;margin:0 0 58px;background:transparent;border:0;border-top:1px solid #d7dce0;border-bottom:1px solid #d7dce0}
.ar-offerings article{display:flex;flex-direction:column;min-height:310px;padding:34px 28px 34px 0}
.ar-offerings article+article{border-left:1px solid #d7dce0;padding-left:29px}
.ar-index{color:#69778a;letter-spacing:.14em;font-size:11px;font-weight:740}
.site-main .ar-offerings h2{font-size:clamp(23px,2.5vw,31px);line-height:1.19;font-weight:590;letter-spacing:-.04em;margin:32px 0 14px;color:#162235}
.ar-offerings p{font-size:15px;line-height:1.75;color:#586576;margin:0 0 32px}
.ar-offerings a{margin-top:auto;color:#214c7f;font-size:14px}
.site-main .ar-note{max-width:none;display:flex;gap:20px;align-items:baseline;padding:0 0 60px;margin:0;background:transparent;border:0}
.ar-note span{min-width:165px;font-size:11px;letter-spacing:.17em;color:#626e7c;font-weight:750}
.ar-note p{font-size:14px;color:#586576;margin:0}
.ar-note a{color:#225184}
.site-main .ar-vision{max-width:none;padding:clamp(30px,6vw,76px);margin:0 0 94px;background:#142238;color:#fff;border:0;border-radius:4px}
.ar-vision-top{display:flex;justify-content:space-between;gap:20px;color:#b6c3d4;font-weight:750;letter-spacing:.16em;font-size:10px}
.site-main .ar-vision h2{color:#fff!important;font-size:clamp(46px,7vw,92px);line-height:1.03;font-weight:525;letter-spacing:-.065em;margin:83px 0 26px}
.site-main .ar-vision p{color:#dce4f0;font-size:clamp(17px,1.7vw,21px);line-height:1.65;max-width:31em;margin:0 0 36px}
.site-main .ar-vision a{color:#fff;display:inline-flex;border-bottom:1px solid #9dacc3;padding-bottom:9px;font-size:15px}
.site-main .ar-lastline{max-width:none;padding:0 0 54px;margin:0;display:flex;align-items:center;justify-content:space-between;gap:30px;border:0;background:transparent}
.site-main .ar-lastline h2{font-size:clamp(33px,4.3vw,56px);line-height:1.15;letter-spacing:-.05em;color:#152237;margin:0;font-weight:550}
.ar-outline{display:inline-flex;gap:28px;color:#142238;border:1px solid #aebdc9;padding:18px 24px;border-radius:3px;white-space:nowrap}
.site-main .ar-recruit{max-width:1000px;background:transparent;border:0;padding:70px 0}
.ar-recruit .ar-display{font-size:clamp(52px,7vw,90px)}
.ar-recruit-status{margin:30px 0;padding:25px;background:#e9eef2;border-left:3px solid #2a4f82}
.ar-recruit-status p{color:#505c6c;margin-bottom:0}
.ar-recruit-steps{padding:22px 0}
.ar-recruit-steps h2{font-size:27px}
.ar-recruit-steps li{padding:10px 0;line-height:1.6}
.site-footer .foot a{display:inline-block;padding:2px 0}
a:focus-visible{outline:3px solid #2e5fe0;outline-offset:4px}
@media(max-width:900px){
 .site-main .ar-hero{grid-template-columns:1fr;gap:28px;padding:46px 0 70px}
 .ar-photo,.ar-photo img{min-height:460px;height:460px}
 .site-main .ar-manifesto{grid-template-columns:1fr 2fr}
 .ar-manifesto p:last-child{grid-column:2}
}
@media(max-width:620px){
 .site-main .ar-hero{padding:40px 0 56px}
 .ar-display{font-size:clamp(56px,12.8vw,76px)}
 .ar-lead{font-size:18px}
 .ar-photo,.ar-photo img{height:375px;min-height:375px}
 .site-main .ar-manifesto{grid-template-columns:1fr;gap:10px;margin-bottom:33px}
 .ar-manifesto p:last-child{grid-column:auto}
 .site-main .ar-offerings{grid-template-columns:1fr;margin-bottom:38px}
 .ar-offerings article{min-height:0;padding:25px 0 30px}
 .ar-offerings article+article{padding:25px 0 30px;border-left:0;border-top:1px solid #d7dce0}
 .site-main .ar-offerings h2{margin:14px 0 10px}
 .site-main .ar-note{display:block;padding:0 0 42px}
 .site-main .ar-vision{margin-bottom:59px;padding:32px 27px}
 .ar-vision-top{font-size:9px}
 .site-main .ar-vision h2{margin-top:65px;font-size:clamp(46px,11vw,65px)}
 .site-main .ar-lastline{align-items:flex-start;flex-direction:column;padding-bottom:20px}
 .site-main .ar-recruit{padding-top:45px}
}


/* Make new full-width editorial sections override the legacy 830px article constraint. */
.site-main > section.ar-hero,
.site-main > section.ar-manifesto,
.site-main > section.ar-offerings,
.site-main > section.ar-note,
.site-main > section.ar-vision,
.site-main > section.ar-lastline,
.site-main > section.ar-recruit {
  max-width:none;
  margin-left:0;
  margin-right:0;
}

</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header"><div class="header-inner">
<a class="lockup" href="/" aria-label="American Rider home">
<div class="brand">AMERICAN RIDER</div>
<div class="tagline">NATIONAL TRANSPORTATION</div>
</a>
<nav aria-label="Main navigation">${nav}</nav>
</div></header>
<main class="site-main" id="main">
${bodyHtml}
</main>
<footer class="site-footer"><div class="foot">
<a href="/about">About</a> · <a href="/recruit">Recruiter opportunities</a> · <a href="/terms">Terms of Service</a> ·
<a href="/privacy">Privacy Policy</a><br>
<a href="mailto:support@americanrider.app">support@americanrider.app</a><br>
<a href="mailto:relations@americanrider.app">relations@americanrider.app</a><br>
<span class="stamp">AMERICAN RIDER · UNITED STATES</span></div>
</footer></body></html>`;
}

module.exports = { page, T };
