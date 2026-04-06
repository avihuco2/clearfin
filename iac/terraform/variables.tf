variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "il-central-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (ALB requires 2+ AZs)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (EC2)"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"
}

variable "key_pair_name" {
  description = "EC2 key pair name for SSH access (optional — deploy via SSM)"
  type        = string
  default     = ""
}

variable "app_port" {
  description = "Port the app listens on inside EC2"
  type        = number
  default     = 3000
}

# Secrets — passed via TF_VAR_ env vars in CI, never committed
variable "supabase_url" {
  description = "Supabase project URL"
  type        = string
  sensitive   = true
  default     = ""
}

variable "supabase_anon_key" {
  description = "Supabase anon public key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "supabase_service_role_key" {
  description = "Supabase service role key (server-only)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "credentials_encryption_key" {
  description = "AES-256-GCM key (32 bytes hex) for bank credential encryption"
  type        = string
  sensitive   = true
  default     = ""
}

variable "anthropic_api_key" {
  description = "Anthropic API key for AI categorization"
  type        = string
  sensitive   = true
  default     = ""
}

variable "upstash_redis_rest_url" {
  description = "Upstash Redis REST URL"
  type        = string
  sensitive   = true
  default     = ""
}

variable "upstash_redis_rest_token" {
  description = "Upstash Redis REST token"
  type        = string
  sensitive   = true
  default     = ""
}

variable "next_public_supabase_url" {
  description = "Supabase URL exposed to the browser"
  type        = string
  default     = ""
}

variable "next_public_supabase_anon_key" {
  description = "Supabase anon key exposed to the browser"
  type        = string
  sensitive   = true
  default     = ""
}
