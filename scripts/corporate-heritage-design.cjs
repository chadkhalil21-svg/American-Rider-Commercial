"use strict";
// American Rider: institutional, heritage-informed editorial presentation.
// Heritage is a visual reference, not a claim of company age or historic service.
// No investor-deck content or unverified service-performance claim is used.
function applyEditorialDesign(pages) {
  pages[""].title = "American Rider | Transportation in the United States";
  pages[""].body = [
    '<section class="heritage-hero" aria-labelledby="heritage-title">',
    '<img class="heritage-photo" src="https://images.unsplash.com/photo-1518011561382-adb6cac8d645?auto=format&fit=crop&w=2200&q=85" width="1800" height="1170" fetchpriority="high" alt="The vaulted main concourse of Grand Central Terminal in New York, pictured as an architectural reference to American transportation history">',
    '<div class="heritage-shade" aria-hidden="true"></div>',
    '<div class="heritage-hero-inner shell">',
    '<p class="heritage-kicker">Independent transportation · United States</p>',
    '<h1 id="heritage-title">American<br>Rider</h1>',
    '<div class="heritage-hero-bottom"><p>A transportation company connecting Travelers with qualified independent Operators. Beginning in select communities.</p><a class="heritage-on-dark" href="/company/">Discover the company <span aria-hidden="true">↗</span></a></div>',
    '</div>',
    '<p class="heritage-caption">Grand Central Terminal, New York · Photograph: Jack Finnigan / Unsplash · Architectural reference</p>',
    '</section>',
    '<section class="heritage-intro shell" aria-labelledby="heritage-about">',
    '<p class="heritage-index">01 &nbsp;/&nbsp; THE COMPANY</p>',
    '<div><h2 id="heritage-about">An American company, with a considered approach to transportation.</h2><p>American Rider brings people and independent transportation professionals together. The work is practical: make the experience clear, support the people involved, and establish the requirements under which each journey takes place.</p><a class="heritage-link" href="/company/">About American Rider <span aria-hidden="true">↗</span></a></div>',
    '</section>',
    '<section class="heritage-paths" aria-label="Explore American Rider"><div class="shell">',
    '<div class="heritage-section-head"><p class="heritage-index">02 &nbsp;/&nbsp; OUR SERVICE</p><h2>For those who travel.<br>For those who operate.</h2></div>',
    '<div class="heritage-two"><article><span class="heritage-number">I</span><h3>Travelers</h3><p>Information, transportation arrangements, and access to assistance, organized around the journey itself.</p><a class="heritage-link" href="/travel/">Explore Travel <span aria-hidden="true">↗</span></a></article>',
    '<article><span class="heritage-number">II</span><h3>Operators</h3><p>Independent professional work with defined terms, documented requirements, and a clear relationship with the company.</p><a class="heritage-link" href="/operate/">Explore Operating <span aria-hidden="true">↗</span></a></article></div>',
    '</div></section>',
    '<section class="heritage-dark" aria-labelledby="heritage-ambition"><div class="shell heritage-dark-inner"><p class="heritage-index">03 &nbsp;/&nbsp; OUR OUTLOOK</p>',
    '<h2 id="heritage-ambition">From the first community to the wider nation.</h2>',
    '<div class="heritage-dark-bottom"><p>American Rider is being developed for service across the United States. Expansion will take place where qualified Operators and applicable requirements permit operations. The public mobile-app release is in preparation.</p><a class="heritage-on-dark" href="/safety/">Our operating standards <span aria-hidden="true">↗</span></a></div>',
    '</div></section>',
    '<section class="heritage-closing shell"><p class="heritage-index">04 &nbsp;/&nbsp; RELATIONSHIPS</p><div><h2>Work with American Rider.</h2><p>We welcome professional inquiries as we develop the company and its independent recruitment program.</p><a class="heritage-link" href="/recruitment/">Recruitment and business inquiries <span aria-hidden="true">↗</span></a></div></section>'
  ].join("");

  pages.travel.title = "For Travelers | American Rider";
  pages.travel.body = [
    '<section class="page-hero shell"><p class="section-label">FOR TRAVELERS</p><h1>Travel with American Rider.</h1><p>Transportation should be straightforward to arrange and clearly presented from the first request to the journey’s completion.</p></section>',
    '<div class="shell"><section class="page-section"><h2>Your journey</h2><p>American Rider is designed to show the transportation options available for your location, the total price before confirmation, and the identity and vehicle details of the Operator assigned to your Travel.</p></section>',
    '<section class="page-section"><h2>Assistance</h2><p>Account, payment and Travel assistance are part of the service. Safety-related matters have their own reporting path.</p><p><a class="text-link" href="/support/">Contact support ↗</a></p></section>',
    '<section class="page-section"><h2>Availability</h2><p>The public mobile-app release is being prepared. This website does not accept or confirm transportation bookings. Service availability and vehicle types depend on the market.</p></section></div>'
  ].join("");

  pages.operate.title = "For Operators | American Rider";
  pages.operate.body = [
    '<section class="page-hero shell"><p class="section-label">FOR INDEPENDENT OPERATORS</p><h1>A professional relationship, on defined terms.</h1><p>American Rider is built to connect qualified independent Operators with transportation opportunities, while preserving the Operator’s independent business.</p></section>',
    '<div class="shell"><section class="page-section"><h2>The commercial arrangement</h2><p>Operators retain <strong>99% of the Travel Fare</strong>. The separate Platform Fee starts at $2.50 per Travel and is included in the Traveler’s agreed Total. It is not deducted from the Operator’s fare share.</p><p>Actual earnings depend on eligible completed Travels. Vehicle, insurance, taxes and other business expenses remain the Operator’s responsibility.</p></section>',
    '<section class="page-section"><h2>Professional eligibility</h2><p>Operating requires current driving credentials, a qualifying vehicle, appropriate commercial coverage, screening, and the requirements that apply to the service area. Eligibility is reviewed throughout the relationship.</p></section>',
    '<section class="page-section"><h2>Payment and participation</h2><p>Eligible amounts are processed through a connected Stripe account, subject to applicable terms. Enrollment requires an open service market and completed individual qualification.</p></section></div>'
  ].join("");

  pages.company.title = "The Company | American Rider";
  pages.company.body = [
    '<section class="page-hero shell"><p class="section-label">THE COMPANY</p><h1>American Rider.</h1><p>An independent transportation company with a national outlook and a practical regard for each journey.</p></section>',
    '<div class="shell"><section class="page-section"><h2>Our purpose</h2><p>To connect Travelers and qualified independent Operators through a service in which arrangements are understandable, responsibilities are defined, and assistance is accessible when needed.</p></section>',
    '<section class="page-section"><h2>The way we operate</h2><p>The company coordinates access, technology and payments. Transportation is performed by independent Operators, not a company-owned chauffeur fleet. Each Operator must meet the requirements that apply to that person, vehicle and service area.</p></section>',
    '<section class="page-section"><h2>Our future</h2><p>American Rider is preparing its wider public release and intends to expand across the United States as qualified service becomes available. That national outlook does not imply service in every location today.</p></section></div>'
  ].join("");

  pages.safety.title = "Operating Standards | American Rider";
  pages.safety.body = [
    '<section class="page-hero shell"><p class="section-label">OUR STANDARDS</p><h1>Responsibility in practice.</h1><p>Transportation depends on the continuing eligibility of the people and vehicles providing it.</p></section>',
    '<div class="shell"><section class="page-section"><h2>Operator and vehicle qualifications</h2><p>Independent Operators must maintain suitable credentials, qualifying commercial insurance and vehicle documentation under the rules of the applicable market. Expired or insufficient evidence cannot establish eligibility for new service.</p></section>',
    '<section class="page-section"><h2>Screening</h2><p>Screening and driving-history requirements are applied in accordance with the service area and applicable requirements.</p></section>',
    '<section class="page-section"><h2>Assistance and privacy</h2><p>Travel-related concerns may be reported through support channels. If anyone is in immediate danger, contact local emergency services. Sensitive records must be submitted through the authenticated process, not ordinary email.</p><p><a class="text-link" href="/support/">Support and company contacts ↗</a></p></section></div>'
  ].join("");

  pages.recruitment.title = "Recruitment | American Rider";
  pages.recruitment.body = [
    '<section class="page-hero shell"><p class="section-label">PROFESSIONAL RELATIONSHIPS</p><h1>Independent recruitment.</h1><p>American Rider welcomes inquiries from people interested in representing the company as its transportation network develops.</p></section>',
    '<div class="shell"><section class="page-section"><h2>A separate professional undertaking</h2><p>Independent recruitment is distinct from Travel and Operating. It does not change the Invite a Traveler feature or confer authority to represent American Rider without company approval.</p></section>',
    '<section class="page-section"><h2>Current program status</h2><p>The program is not yet open for enrollment. Individual recruiter identities, referral links, QR codes and attribution will require authorization before they are offered. No commission rate, payment date, or payout provider has been announced.</p></section>',
    '<section class="page-section"><h2>Correspondence</h2><p>Prospective independent recruiters may introduce themselves, describe their professional background and identify the areas in which they wish to work. An inquiry is not an employment offer, appointment, or compensation agreement.</p>',
    '<p><a class="action primary" href="mailto:relations@americanrider.tech?subject=Independent%20recruiter%20inquiry">Email Recruitment Relations ↗</a></p>',
    '<p class="muted">relations@americanrider.tech · Do not send identity documents, financial details, or tax records by email.</p></section></div>'
  ].join("");

  return [
    "\n/* Heritage-informed institutional site: contemporary accessibility with historic proportion. */",
    ":root{--ink:#242624;--navy:#18272a;--blue:#384f54;--paper:#f6f4ee;--line:#d9d6cb;--muted:#626661;--wide:1270px}",
    "body{background:var(--paper);color:var(--ink);font-family:Arial,Helvetica,sans-serif;font-weight:400;letter-spacing:.003em}",
    ".masthead{background:#f6f4ee;border-bottom:1px solid #dedbd2;position:relative;z-index:9}",
    ".mast{min-height:94px}",
    ".identity{min-width:210px}",
    ".identity strong{font:500 25px/1 Georgia,'Times New Roman',serif;letter-spacing:-.017em;white-space:nowrap;color:#202b2a}",
    ".identity span{display:none}",
    ".nav{gap:28px}.nav a{font-size:12px;letter-spacing:.025em;color:#37403f}.nav a:hover,.nav a[aria-current=page]{color:#1b292b;text-underline-offset:9px}",
    ".footer{background:#eceae1;border-top:1px solid #d6d3c9}",
    ".foot-top .brand{font:500 26px/1.1 Georgia,'Times New Roman',serif;letter-spacing:-.025em}",
    ".foot-top h3{letter-spacing:.13em}.foot-top a{color:#243332}",
    ".action{min-height:51px;font-size:13px;font-weight:550;border-color:#243332;letter-spacing:.025em}",
    ".action.primary{background:#233638;color:#fff}.action.primary:hover{background:#3e5351}",
    ".text-link,.heritage-link{display:inline-flex;gap:25px;align-items:center;font-size:13px;font-weight:600;letter-spacing:.01em;text-decoration:none;padding-bottom:8px;border-bottom:1px solid #343d3b}",
    ".text-link:hover,.heritage-link:hover{border-bottom-width:2px}",
    ".page-hero{padding:112px 0 83px}.page-hero h1{font:400 clamp(58px,6.7vw,107px)/1.02 Georgia,'Times New Roman',serif;letter-spacing:-.055em;max-width:1000px;margin:21px 0 26px}",
    ".page-hero p{max-width:745px;line-height:1.68;color:#515751;font-size:19px}",
    ".page-hero .section-label,.section-label{font-size:11px;letter-spacing:.21em;color:#6d726b}",
    ".page-section{padding:74px 0 78px;display:grid;grid-template-columns:minmax(230px,1fr) minmax(0,1.4fr);column-gap:8%;align-items:start}",
    ".page-section h2{font:400 clamp(27px,3vw,43px)/1.14 Georgia,'Times New Roman',serif;letter-spacing:-.035em}",
    ".page-section p,.page-section ul{grid-column:2;max-width:680px;margin-top:0;color:#555d57;font-size:16px}",
    ".page-section .inset{grid-column:2}",
    ".page-section h2+p{margin-top:0}",
    ".legal-body h1{font-family:Georgia,'Times New Roman',serif;font-weight:400}",
    ".heritage-hero{position:relative;min-height:min(790px,85vw);height:calc(100svh - 94px);max-height:890px;overflow:hidden;background:#222924;color:#fff}",
    ".heritage-photo{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;object-position:center 48%;filter:saturate(.53) contrast(1.04) brightness(.83)}",
    ".heritage-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,17,19,.81) 0%,rgba(8,17,19,.44) 55%,rgba(8,17,19,.25) 100%),linear-gradient(0deg,rgba(8,17,19,.54),transparent 36%)}",
    ".heritage-hero-inner{position:relative;z-index:1;min-height:100%;display:flex;flex-direction:column;justify-content:space-between;padding-top:115px;padding-bottom:116px}",
    ".heritage-kicker{font-size:11px;letter-spacing:.27em;text-transform:uppercase;color:#e3e0d7;line-height:1.5}",
    ".heritage-hero h1{font:400 clamp(93px,12vw,187px)/.88 Georgia,'Times New Roman',serif;letter-spacing:-.075em;margin:22px 0 40px;text-shadow:0 3px 18px #10151917}",
    ".heritage-hero-bottom{display:flex;gap:6%;align-items:end;border-top:1px solid #d9e0d56d;padding-top:28px;max-width:950px}",
    ".heritage-hero-bottom p{font-size:18px;line-height:1.7;max-width:570px;margin:0;color:#fff}",
    ".heritage-on-dark{color:#fff;text-decoration:none;display:inline-flex;white-space:nowrap;align-items:center;gap:18px;font-size:13px;font-weight:600;border-bottom:1px solid #e9eee7;padding-bottom:8px}",
    ".heritage-on-dark:hover{border-bottom-width:2px}",
    ".heritage-caption{position:absolute;right:29px;bottom:17px;z-index:1;font-size:10px;color:#f0ede5c9;letter-spacing:.04em;margin:0;text-align:right}",
    ".heritage-intro{display:grid;grid-template-columns:1fr 2fr;gap:8%;padding-top:145px;padding-bottom:150px}",
    ".heritage-index{font-size:11px;letter-spacing:.16em;font-weight:650;color:#797b73;margin:0;text-transform:uppercase}",
    ".heritage-intro h2,.heritage-section-head h2,.heritage-dark h2,.heritage-closing h2{font:400 clamp(43px,4.8vw,78px)/1.14 Georgia,'Times New Roman',serif;letter-spacing:-.047em;margin:0;max-width:850px}",
    ".heritage-intro p:not(.heritage-index){max-width:640px;font-size:18px;line-height:1.77;color:#59615c;margin:35px 0}",
    ".heritage-paths{background:#eae8df;padding:120px 0 145px}",
    ".heritage-section-head{display:grid;grid-template-columns:1fr 2fr;gap:8%}",
    ".heritage-two{display:grid;grid-template-columns:1fr 1fr;gap:10%;margin-top:112px}",
    ".heritage-two article{border-top:1px solid #b9bbb2;padding-top:24px}",
    ".heritage-number{font:400 17px/1 Georgia,serif;color:#757a71}",
    ".heritage-two h3{font:400 clamp(42px,4vw,65px)/1.1 Georgia,'Times New Roman',serif;letter-spacing:-.04em;margin:39px 0 21px}",
    ".heritage-two p{font-size:17px;line-height:1.75;max-width:480px;min-height:100px;color:#5a625c;margin:0 0 27px}",
    ".heritage-dark{background:#183033;color:#f5f4ee;padding:124px 0 145px}",
    ".heritage-dark .heritage-index{color:#bdc7bf}",
    ".heritage-dark h2{font-size:clamp(57px,6.8vw,108px);max-width:970px;margin:60px 0 75px;color:#fff}",
    ".heritage-dark-bottom{border-top:1px solid #acb9b077;padding-top:35px;display:flex;justify-content:space-between;align-items:end;gap:9%}",
    ".heritage-dark-bottom p{max-width:630px;line-height:1.8;color:#dee4dd;font-size:17px;margin:0}",
    ".heritage-closing{padding-top:135px;padding-bottom:153px;display:grid;grid-template-columns:1fr 2fr;gap:8%}",
    ".heritage-closing p:not(.heritage-index){max-width:650px;font-size:18px;color:#59615c;line-height:1.7;margin:28px 0}",
    "@media(max-width:940px){.nav{gap:15px}.nav a{font-size:11px}.heritage-hero-inner{padding-top:90px;padding-bottom:100px}.heritage-hero h1{font-size:clamp(83px,12vw,132px)}}",
    "@media(max-width:700px){.mast{min-height:77px}.identity{min-width:0}.identity strong{font-size:22px}.mobile-nav summary{font-size:12px}.heritage-hero{height:calc(100svh - 77px);min-height:610px;max-height:790px}.heritage-photo{object-position:52% center}.heritage-shade{background:linear-gradient(90deg,#0e1b1edb,#0e1b1e5c),linear-gradient(0deg,#0e1b1e99,transparent 60%)}.heritage-hero-inner{padding-top:85px;padding-bottom:93px}.heritage-hero h1{font-size:clamp(58px,18vw,105px);letter-spacing:-.07em}.heritage-kicker{font-size:10px;letter-spacing:.18em}.heritage-hero-bottom{display:block;max-width:400px}.heritage-hero-bottom p{font-size:16px;line-height:1.6;margin-bottom:21px}.heritage-caption{right:15px;bottom:14px;font-size:9px;max-width:290px}.heritage-intro,.heritage-section-head,.heritage-closing{display:block}.heritage-intro{padding-top:85px;padding-bottom:95px}.heritage-index{margin-bottom:25px}.heritage-intro h2,.heritage-section-head h2,.heritage-closing h2{font-size:clamp(42px,10vw,59px)}.heritage-intro p:not(.heritage-index){font-size:16px}.heritage-paths{padding:82px 0 93px}.heritage-two{display:block;margin-top:65px}.heritage-two article+article{margin-top:65px}.heritage-two h3{font-size:45px}.heritage-two p{min-height:0;font-size:16px}.heritage-dark{padding:86px 0 99px}.heritage-dark h2{font-size:clamp(49px,10vw,75px);margin:43px 0 53px}.heritage-dark-bottom{display:block}.heritage-dark-bottom p{font-size:16px;margin-bottom:23px}.heritage-closing{padding-top:91px;padding-bottom:110px}.heritage-closing p:not(.heritage-index){font-size:16px}.page-hero{padding:75px 0 58px}.page-hero h1{font-size:clamp(52px,10vw,72px)}.page-hero p{font-size:17px}.page-section{display:block;padding:53px 0}.page-section h2{font-size:34px}.page-section p{font-size:16px}.page-section .inset{padding:24px}}",
    "@media(prefers-reduced-motion:reduce){.heritage-link,.heritage-on-dark{transition:none}}"
  ].join("\n");
}
module.exports = { applyEditorialDesign };