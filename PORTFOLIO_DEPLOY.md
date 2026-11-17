# Deploying portfolio.johnathancloudspace.com

Hosting: S3 bucket `portfolio.johnathancloudspace.com` (static website, us-east-1) behind CloudFront
distribution `E1NOS3TVBTSWJS`. AWS account 194959907772. The page is one file, uploaded as `index.html`.

Source: `portfolio-index.html` in this repo (branch `rebuild/portfolio-oct`). Until this branch, the
live version existed only as unpushed commits in a local clone; this file starts from that live
version (byte-identical to the deployed `index.html` of 2026-05-30) and applies the October 2026 fixes.

```bash
aws sts get-caller-identity          # confirm account 194959907772
aws s3 sync portfolio-diagrams/2026-11 s3://portfolio.johnathancloudspace.com/diagrams/2026-11 --content-type image/png
aws s3 cp portfolio-index.html s3://portfolio.johnathancloudspace.com/index.html --content-type text/html
aws cloudfront create-invalidation --distribution-id E1NOS3TVBTSWJS --paths "/index.html" "/" "/diagrams/2026-11/*"
```

Upload the diagrams before the page: the site answers any missing path with `index.html` and a 200,
so a page that points at diagrams not yet uploaded shows broken images, and a link check won't catch it.

Diagrams: `portfolio-diagrams/2026-11/` holds each project's architecture diagram at 300 DPI
(`<project>-<diagram>.png`, opened when a visitor taps a diagram) and a 1600 px copy for the page
(`<project>-<diagram>-web.png`). They are copies of `docs/architecture/` in each project repo.
The older files directly under `/diagrams/` (including `shootitpicks.png`) are no longer linked and
can be deleted from the bucket once approved.
