# ---------------------------------------------------------------------------
# VPC Interface Endpoints — PrivateLink (no internet required for AWS APIs)
# ---------------------------------------------------------------------------

resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [aws_subnet.private[0].id]
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "clearfin-vpce-secretsmanager" }
}

resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [aws_subnet.private[0].id]
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "clearfin-vpce-ssm" }
}

resource "aws_vpc_endpoint" "ssmmessages" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ssmmessages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [aws_subnet.private[0].id]
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "clearfin-vpce-ssmmessages" }
}

resource "aws_vpc_endpoint" "ec2messages" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ec2messages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [aws_subnet.private[0].id]
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "clearfin-vpce-ec2messages" }
}

# ---------------------------------------------------------------------------
# Secrets Manager secrets
# All values are populated via TF_VAR_ environment variables in CI.
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "app" {
  name                    = "clearfin/app"
  description             = "ClearFin app environment secrets"
  recovery_window_in_days = 0 # Allow immediate deletion during dev

  tags = { Name = "clearfin-app-secret" }
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id

  secret_string = jsonencode({
    SUPABASE_URL                   = var.supabase_url
    SUPABASE_ANON_KEY              = var.supabase_anon_key
    SUPABASE_SERVICE_ROLE_KEY      = var.supabase_service_role_key
    CREDENTIALS_ENCRYPTION_KEY     = var.credentials_encryption_key
    ANTHROPIC_API_KEY              = var.anthropic_api_key
    UPSTASH_REDIS_REST_URL         = var.upstash_redis_rest_url
    UPSTASH_REDIS_REST_TOKEN       = var.upstash_redis_rest_token
    NEXT_PUBLIC_SUPABASE_URL       = var.next_public_supabase_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY  = var.next_public_supabase_anon_key
  })
}
