# ---------------------------------------------------------------------------
# ALB Security Group — accepts HTTP/HTTPS from internet
# ---------------------------------------------------------------------------
resource "aws_security_group" "alb" {
  name        = "clearfin-alb-sg"
  description = "Allow HTTP/HTTPS inbound to ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "clearfin-alb-sg" }
}

# ---------------------------------------------------------------------------
# EC2 Security Group — accepts traffic only from ALB + SSM via VPC endpoint
# ---------------------------------------------------------------------------
resource "aws_security_group" "ec2" {
  name        = "clearfin-ec2-sg"
  description = "Allow inbound from ALB only; outbound unrestricted"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "App port from ALB"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Allow all outbound (NAT gateway handles internet access)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "clearfin-ec2-sg" }
}

# ---------------------------------------------------------------------------
# VPC Endpoint Security Group — Secrets Manager + SSM PrivateLink
# ---------------------------------------------------------------------------
resource "aws_security_group" "vpc_endpoints" {
  name        = "clearfin-vpce-sg"
  description = "Allow HTTPS from VPC to AWS PrivateLink endpoints"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "clearfin-vpce-sg" }
}
