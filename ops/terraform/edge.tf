resource "aws_acm_certificate" "alb" {
  domain_name               = local.api_domain
  subject_alternative_names = [for domain in local.alb_domains : domain if domain != local.api_domain]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

resource "aws_acm_certificate" "cloudfront" {
  provider                  = aws.us_east_1
  domain_name               = local.admin_domain
  subject_alternative_names = [for domain in local.cloudfront_domains : domain if domain != local.admin_domain]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

resource "aws_route53_record" "alb_certificate_validation" {
  for_each = {
    for domain in local.alb_domains :
    domain => domain
  }

  allow_overwrite = true
  name = one([
    for dvo in aws_acm_certificate.alb.domain_validation_options :
    dvo.resource_record_name
    if dvo.domain_name == each.key
  ])
  records = [one([
    for dvo in aws_acm_certificate.alb.domain_validation_options :
    dvo.resource_record_value
    if dvo.domain_name == each.key
  ])]
  ttl = 60
  type = one([
    for dvo in aws_acm_certificate.alb.domain_validation_options :
    dvo.resource_record_type
    if dvo.domain_name == each.key
  ])
  zone_id = data.aws_route53_zone.primary.zone_id
}

resource "aws_route53_record" "cloudfront_certificate_validation" {
  for_each = {
    for domain in local.cloudfront_domains :
    domain => domain
  }

  allow_overwrite = true
  name = one([
    for dvo in aws_acm_certificate.cloudfront.domain_validation_options :
    dvo.resource_record_name
    if dvo.domain_name == each.key
  ])
  records = [one([
    for dvo in aws_acm_certificate.cloudfront.domain_validation_options :
    dvo.resource_record_value
    if dvo.domain_name == each.key
  ])]
  ttl = 60
  type = one([
    for dvo in aws_acm_certificate.cloudfront.domain_validation_options :
    dvo.resource_record_type
    if dvo.domain_name == each.key
  ])
  zone_id = data.aws_route53_zone.primary.zone_id
}

resource "aws_acm_certificate_validation" "alb" {
  certificate_arn         = aws_acm_certificate.alb.arn
  validation_record_fqdns = [for record in aws_route53_record.alb_certificate_validation : record.fqdn]
}

resource "aws_acm_certificate_validation" "cloudfront" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cloudfront.arn
  validation_record_fqdns = [for record in aws_route53_record.cloudfront_certificate_validation : record.fqdn]
}

resource "aws_lb" "public" {
  name                       = "${local.name_prefix}-alb"
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = local.public_subnet_ids
  drop_invalid_header_fields = true

  tags = local.common_tags
}

resource "aws_lb_target_group" "backend" {
  name        = substr("${local.name_prefix}-backend", 0, 32)
  port        = 4000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = local.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200-399"
    path                = "/api/health"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = local.common_tags
}

resource "aws_lb_target_group" "engine" {
  name        = substr("${local.name_prefix}-engine", 0, 32)
  port        = 8000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = local.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200-399"
    path                = "/health"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = local.common_tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.public.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.public.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = aws_acm_certificate_validation.alb.certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Unknown host"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    host_header {
      values = [local.api_domain]
    }
  }
}

resource "aws_lb_listener_rule" "engine" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 110

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.engine.arn
  }

  condition {
    host_header {
      values = [local.engine_domain]
    }
  }
}

resource "aws_s3_bucket" "admin" {
  bucket = local.admin_bucket_name
  tags   = local.common_tags
}

resource "aws_s3_bucket" "media" {
  bucket = local.media_bucket_name
  tags   = local.common_tags
}

resource "aws_s3_bucket_versioning" "admin" {
  bucket = aws_s3_bucket.admin.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "admin" {
  bucket = aws_s3_bucket.admin.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "admin" {
  bucket                  = aws_s3_bucket.admin.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${local.name_prefix}-s3"
  description                       = "OAC for StockAisle static and media buckets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "admin" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Admin site for ${local.admin_domain}"
  default_root_object = "index.html"
  aliases             = [local.admin_domain]
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.admin.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
    origin_id                = "admin-origin"
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "admin-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = true

      cookies {
        forward = "none"
      }
    }
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cloudfront.certificate_arn
    minimum_protocol_version = "TLSv1.2_2021"
    ssl_support_method       = "sni-only"
  }

  tags = local.common_tags
}

resource "aws_cloudfront_distribution" "media" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Media CDN for ${local.media_domain}"
  aliases         = [local.media_domain]
  price_class     = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
    origin_id                = "media-origin"
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "media-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cloudfront.certificate_arn
    minimum_protocol_version = "TLSv1.2_2021"
    ssl_support_method       = "sni-only"
  }

  tags = local.common_tags
}

data "aws_iam_policy_document" "admin_bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.admin.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.admin.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "admin" {
  bucket = aws_s3_bucket.admin.id
  policy = data.aws_iam_policy_document.admin_bucket.json
}

data "aws_iam_policy_document" "media_bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.media.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = data.aws_iam_policy_document.media_bucket.json
}

resource "aws_route53_record" "admin" {
  allow_overwrite = true
  zone_id         = data.aws_route53_zone.primary.zone_id
  name            = local.admin_domain
  type            = "A"

  alias {
    evaluate_target_health = false
    name                   = aws_cloudfront_distribution.admin.domain_name
    zone_id                = aws_cloudfront_distribution.admin.hosted_zone_id
  }
}

resource "aws_route53_record" "media" {
  allow_overwrite = true
  zone_id         = data.aws_route53_zone.primary.zone_id
  name            = local.media_domain
  type            = "A"

  alias {
    evaluate_target_health = false
    name                   = aws_cloudfront_distribution.media.domain_name
    zone_id                = aws_cloudfront_distribution.media.hosted_zone_id
  }
}

resource "aws_route53_record" "api" {
  allow_overwrite = true
  zone_id         = data.aws_route53_zone.primary.zone_id
  name            = local.api_domain
  type            = "A"

  alias {
    evaluate_target_health = true
    name                   = aws_lb.public.dns_name
    zone_id                = aws_lb.public.zone_id
  }
}

resource "aws_route53_record" "engine" {
  allow_overwrite = true
  zone_id         = data.aws_route53_zone.primary.zone_id
  name            = local.engine_domain
  type            = "A"

  alias {
    evaluate_target_health = true
    name                   = aws_lb.public.dns_name
    zone_id                = aws_lb.public.zone_id
  }
}
