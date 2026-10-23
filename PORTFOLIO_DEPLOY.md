# Deploying portfolio.johnathancloudspace.com

Hosting: S3 bucket `portfolio.johnathancloudspace.com` (static website, us-east-1) behind CloudFront
distribution `E1NOS3TVBTSWJS`. AWS account 194959907772. The page is one file, uploaded as `index.html`.

Source: `portfolio-index.html` in this repo (branch `rebuild/portfolio-oct`). Until this branch, the
live version existed only as unpushed commits in a local clone; this file starts from that live
version (byte-identical to the deployed `index.html` of 2026-05-30) and applies the October 2026 fixes.

```bash
aws sts get-caller-identity          # confirm account 194959907772
aws s3 cp portfolio-index.html s3://portfolio.johnathancloudspace.com/index.html --content-type text/html
aws cloudfront create-invalidation --distribution-id E1NOS3TVBTSWJS --paths "/index.html" "/"
```

Diagrams under `/diagrams/` are served from the same bucket. The medical, transaction anomaly, legal
and EduAI diagrams show architectures that were not built, so the page no longer links them; they
can be deleted from the bucket once approved.
