# ClearFin — AWS IaC (il-central-1)

Terraform configuration for deploying ClearFin to AWS Israel (Tel Aviv) region.

## Why il-central-1?

Isracard's scraper blocks cloud provider IPs. AWS il-central-1 uses Israeli IP ranges
that are far less likely to be blocked. The NAT Gateway's Elastic IP (`nat_gateway_ip`
output) is the egress IP for all scraper traffic — you can request Isracard to whitelist it.

## Architecture

```
Internet → ALB (public subnets, 2 AZs)
             └── EC2 (private subnet, t3.medium)
                   ├── Next.js web app (port 3000)
                   └── BullMQ scraper worker

EC2 → NAT Gateway → Internet (scraper outbound)
EC2 → VPC Endpoints (PrivateLink) → Secrets Manager / SSM
```

## Prerequisites

1. AWS account with il-central-1 enabled
2. S3 bucket `clearfin-tf-state` in il-central-1 (create manually once):
   ```bash
   aws s3 mb s3://clearfin-tf-state --region il-central-1
   aws s3api put-bucket-versioning \
     --bucket clearfin-tf-state \
     --versioning-configuration Status=Enabled
   ```
3. DynamoDB table for state locking (create manually once):
   ```bash
   aws dynamodb create-table \
     --table-name clearfin-tf-locks \
     --attribute-definitions AttributeName=LockID,AttributeType=S \
     --key-schema AttributeName=LockID,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST \
     --region il-central-1
   ```
4. S3 bucket for deployment archives (set as `DEPLOY_BUCKET` GitHub secret):
   ```bash
   aws s3 mb s3://clearfin-deploy-artifacts --region il-central-1
   ```
5. IAM role for GitHub Actions OIDC (set ARN as `AWS_DEPLOY_ROLE_ARN` secret)

## First Deploy

```bash
cd iac/terraform
terraform init
terraform plan \
  -var="supabase_url=..." \
  -var="supabase_anon_key=..." \
  # ... (all TF_VAR_ values)
terraform apply
```

## GitHub Actions Secrets Required

| Secret | Description |
|--------|-------------|
| `AWS_DEPLOY_ROLE_ARN` | IAM role ARN for OIDC federation |
| `EC2_INSTANCE_ID` | From `terraform output ec2_instance_id` |
| `DEPLOY_BUCKET` | S3 bucket name for deploy archives |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (build-time) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (build-time) |
| `SUPABASE_URL` | Supabase URL (Terraform only) |
| `SUPABASE_ANON_KEY` | Supabase anon key (Terraform only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `CREDENTIALS_ENCRYPTION_KEY` | AES-256-GCM key (32 bytes hex) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |

## Deployment Flow

- **App deploy**: every push to `main` → GitHub Actions builds → uploads to S3 → SSM Run Command pulls + restarts PM2
- **Infra changes**: trigger `workflow_dispatch` with `terraform_apply: true`

## Useful Commands

```bash
# SSH-free shell access via SSM
aws ssm start-session --target <instance-id> --region il-central-1

# View app logs
aws ssm send-command \
  --instance-ids <instance-id> \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["sudo -u clearfin pm2 logs --lines 50"]' \
  --region il-central-1

# Get NAT gateway IP (give to Isracard for whitelisting)
terraform output nat_gateway_ip
```
