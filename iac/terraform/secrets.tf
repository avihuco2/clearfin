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
# Secrets Manager secret — Terraform manages the resource (name, KMS key,
# tags) but NOT the values. Populate values once via AWS CLI:
#
#   aws secretsmanager put-secret-value \
#     --secret-id clearfin/app \
#     --secret-string '{"DATABASE_URL":"...","NEXTAUTH_SECRET":"...",...}'
#
# This keeps plaintext secrets out of Terraform state and GitHub entirely.
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "app" {
  name                    = "clearfin/app"
  description             = "ClearFin app environment secrets"
  recovery_window_in_days = 0 # Allow immediate deletion during dev

  tags = { Name = "clearfin-app-secret" }
}
