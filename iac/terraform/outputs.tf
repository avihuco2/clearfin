output "alb_dns_name" {
  description = "Public DNS name of the ALB — point your domain here"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Hosted zone ID of the ALB (needed for Route 53 alias records)"
  value       = aws_lb.main.zone_id
}

output "ec2_instance_id" {
  description = "EC2 instance ID (use for SSM Run Command deployments)"
  value       = aws_instance.app.id
}

output "ec2_private_ip" {
  description = "EC2 private IP address"
  value       = aws_instance.app.private_ip
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "nat_gateway_ip" {
  description = "Elastic IP of the NAT gateway — Isracard must whitelist this"
  value       = aws_eip.nat.public_ip
}

output "secrets_manager_arn" {
  description = "ARN of the Secrets Manager secret"
  value       = aws_secretsmanager_secret.app.arn
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC — set as AWS_DEPLOY_ROLE_ARN in GitHub Secrets"
  value       = aws_iam_role.github_actions.arn
}
