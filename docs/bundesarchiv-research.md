# Finding building records at the Swiss Federal Archives

Research note, 2026-10-08. Use this route when architectural records are hard to find through ordinary web search.

- [BAR search overview](https://www.bar.admin.ch/de/suchen) explains the available services.
- [Online archive access](https://www.recherche.bar.admin.ch/recherche/) is the main catalogue for searching holdings, ordering records and consulting digital material.
- [The owner's broad “Maraini” search](https://www.recherche.bar.admin.ch/recherche/#/de/suche/resultat?q=%7B%22searchGroups%22:%5B%7B%22searchFields%22:%5B%7B%22key%22:%22allData%22,%22value%22:%22Maraini%22%7D,%7B%22key%22:%22creationPeriod%22,%22value%22:%22%22%7D%5D,%22fieldOperator%22:1%7D%5D,%22groupOperator%22:1%7D&op=%7B%22enableHighlighting%22:true,%22enableAggregations%22:true%7D&qs=%7B%22skip%22:0,%22take%22:10,%22orderBy%22:%22%22,%22sortOrder%22:%22%22%7D) illustrates an entry point, but the owner reports too many results. It is a query, not a dossier citation. Results were not enumerated in this pass; a text-only fetch returned the JavaScript loading shell.

The BAR overview describes free digitisation of analogue dossiers on request and delivery by email. The owner received a building-reference batch as an email attachment and reports that many dossiers are freely accessible but difficult to locate. This is useful acquisition context, not a guarantee that any particular dossier is unrestricted or already digitised.

## Authentication and a human collaborator

BAR is a useful lead, but not a dependable unattended download source. In this project's experience, retrieval required a government login and a human obtained the files by email. Catalogue discovery, ordering, authorisation to consult and downloading are distinct steps; free availability does not imply anonymous access.

The [BAR user handbook, account registration section](https://www.bar.admin.ch/dam/bar/en/dokumente/kundeninformation/Benutzerhandbuch-Webportal.pdf.download.pdf/User-Handbook-2024_02-12.pdf) describes eIAM and AGOV; some interface/documentation labels also mention CH-LOGIN. Follow the provider actually offered by the portal. The owner's “eCH” wording should not be recorded as a verified authentication product name.

Agents should prepare a short list of promising dossier titles/reference codes and the reason each is useful. A human collaborator can authenticate, request or download the material and place it in the building's `work/references/incoming/`, ideally with the dossier permalink/reference and covering provenance. Do not ask for login credentials or try to work around authentication. Do not send archive requests without authorization. Continue processing available evidence while human retrieval is pending.

## Suggested search sequence

1. Search the full building name and its variants separately, rather than only a person's surname. For example: `Villa Maraini`, `Villino Maraini`, `Istituto Svizzero Roma`, `Schweizerisches Institut Rom`.
2. Try the street address, city and responsible federal office, then an established property identifier if available, such as `4978` or `4978 IA`. These are candidate queries, not confirmed catalogue matches.
3. Inspect the dossier title, reference code, creating authority, date span and position in the archival hierarchy. A surname hit may concern a person rather than the building.
4. Narrow by those verified details. Do not impose a recent date range too early: modern work may rely on drawings filed in an older dossier.
5. Record the dossier permalink and reference code when found. A search-results URL is insufficient provenance for an individual drawing.
6. If delivered by email, retain the supplied filenames and hashes and record that delivery route. An attachment can be processed without a public download URL; do not invent one. Correspondence, attachment names and dossier identifiers remain in private research.

## Evidence handling

Follow the [handbook](reconstruction-handbook.md) and [source-record conventions](conventions.md#records). Keep source files and derivatives in the building's private `work/`, preserve originals, and distinguish sheet dates from revision dates, scan dates, PDF export dates and filename years. Public access does not by itself establish permission to redistribute source files. Archive availability also does not establish that a drawing was executed or is a measured survey.

Register a delivery as user-supplied archive material until its precise archival identity is known. Preserve uncertainty explicitly so future agents can improve provenance without repeating acquisition or treating an old proposal as the current building.
