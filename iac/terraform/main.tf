terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "clearfin-tf-state-930458520260"
    key            = "clearfin/terraform.tfstate"
    region         = "il-central-1"
    dynamodb_table = "clearfin-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "clearfin"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
