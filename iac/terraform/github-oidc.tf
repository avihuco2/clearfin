# ---------------------------------------------------------------------------
# GitHub Actions OIDC — lets GitHub Actions assume an AWS IAM role
# with short-lived tokens. No static AWS credentials stored anywhere.
# ---------------------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "github_actions" {
  name        = "clearfin-github-actions"
  description = "Assumed by GitHub Actions via OIDC - no static credentials"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:avihuco2/clearfin:*"
        }
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_actions" {
  name = "clearfin-github-actions-policy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # ── Deploy: upload artifact to S3 ──────────────────────────────────────
      {
        Sid    = "DeployS3"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject", "s3:HeadObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::clearfin-deploy-artifacts/*"
      },
      {
        Sid      = "DeployS3List"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::clearfin-deploy-artifacts"
      },
      # ── Deploy: SSM Run Command on EC2 ────────────────────────────────────
      {
        Sid    = "SSMDeploy"
        Effect = "Allow"
        Action = [
          "ssm:SendCommand",
          "ssm:GetCommandInvocation",
          "ssm:DescribeInstanceInformation",
          "ssm:ListCommandInvocations",
        ]
        Resource = "*"
      },
      # ── Terraform state: S3 backend ───────────────────────────────────────
      {
        Sid    = "TerraformState"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [
          "arn:aws:s3:::clearfin-tf-state-930458520260",
          "arn:aws:s3:::clearfin-tf-state-930458520260/*",
        ]
      },
      # ── Terraform state: DynamoDB lock ────────────────────────────────────
      {
        Sid    = "TerraformLock"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem", "dynamodb:PutItem",
          "dynamodb:DeleteItem", "dynamodb:DescribeTable",
        ]
        Resource = "arn:aws:dynamodb:${var.aws_region}:*:table/clearfin-tf-locks"
      },
      # ── Terraform apply: manage infra resources ───────────────────────────
      {
        Sid    = "TerraformEC2VPC"
        Effect = "Allow"
        Action = [
          "ec2:*",
          "elasticloadbalancing:*",
        ]
        Resource = "*"
      },
      {
        Sid    = "TerraformIAM"
        Effect = "Allow"
        Action = [
          "iam:GetRole", "iam:CreateRole", "iam:DeleteRole",
          "iam:AttachRolePolicy", "iam:DetachRolePolicy",
          "iam:PutRolePolicy", "iam:DeleteRolePolicy",
          "iam:GetRolePolicy", "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile",
          "iam:GetInstanceProfile", "iam:AddRoleToInstanceProfile",
          "iam:RemoveRoleFromInstanceProfile",
          "iam:PassRole",
          "iam:GetOpenIDConnectProvider",
          "iam:CreateOpenIDConnectProvider",
          "iam:DeleteOpenIDConnectProvider",
          "iam:TagOpenIDConnectProvider",
          "iam:TagRole",
        ]
        Resource = "*"
      },
      {
        Sid    = "TerraformSecretsManager"
        Effect = "Allow"
        Action = [
          "secretsmanager:CreateSecret",
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:DeleteSecret",
          "secretsmanager:TagResource",
          "secretsmanager:ListSecretVersionIds",
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:clearfin/*"
      },
      {
        Sid    = "TerraformKMS"
        Effect = "Allow"
        Action = [
          "kms:CreateKey", "kms:DescribeKey", "kms:GetKeyPolicy",
          "kms:GetKeyRotationStatus", "kms:ListResourceTags",
          "kms:ScheduleKeyDeletion", "kms:EnableKeyRotation",
          "kms:PutKeyPolicy", "kms:TagResource",
          "kms:CreateAlias", "kms:DeleteAlias", "kms:ListAliases",
        ]
        Resource = "*"
      },
    ]
  })
}
