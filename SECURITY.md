# Security

## Reporting a problem

Please don't report a security problem in a public issue, pull request or
discussion. Report it privately instead: on this repository's **Security** tab,
choose **Report a vulnerability**. Only the maintainers can read the report.

Please include:

- what you found and what it lets someone do;
- the steps to reproduce it, ideally with a small design repo that shows it;
- the release tag you used.

We read every report and reply in the same private thread. Please give us time
to release a fix before you talk about the problem in public.

## Supported versions

Fixes go into a new release. Older releases are not patched, so please update
to the latest tag.

## What we want to hear about

Teal Lemur reads a design repo and writes static files. Problems we treat as
security issues include:

- a design repo that makes `check`, `build` or `hub` read or write files
  outside the repo and the output folder;
- a design repo that makes Teal Lemur run code on the machine that runs it;
- viewer pages that load anything from outside their own site, or that get
  around the viewer's Content Security Policy.

Not a Teal Lemur problem: a design repo's own pages run as written when
someone opens them, and every product on a hub shares one site. Review design
changes from people you don't trust before you build them, as you would review
code.
