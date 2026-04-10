resource "aws_vpc" "main" {
  count = local.use_existing_network ? 0 : 1

  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-vpc"
  })
}

resource "aws_internet_gateway" "main" {
  count  = local.use_existing_network ? 0 : 1
  vpc_id = aws_vpc.main[0].id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-igw"
  })
}

resource "aws_subnet" "public" {
  for_each = local.use_existing_network ? {} : {
    for idx, cidr in var.public_subnet_cidrs :
    idx => {
      cidr = cidr
      az   = data.aws_availability_zones.available.names[idx]
    }
  }

  vpc_id                  = aws_vpc.main[0].id
  cidr_block              = each.value.cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-${each.key}"
    Tier = "public"
  })
}

resource "aws_route_table" "public" {
  count  = local.use_existing_network ? 0 : 1
  vpc_id = aws_vpc.main[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main[0].id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  for_each       = local.use_existing_network ? {} : aws_subnet.public
  subnet_id      = each.value.id
  route_table_id = aws_route_table.public[0].id
}

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb"
  description = "Public ALB security group"
  vpc_id      = local.vpc_id

  ingress {
    description      = "HTTP"
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  ingress {
    description      = "HTTPS"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-alb-sg"
  })
}

resource "aws_security_group" "backend" {
  name        = "${local.name_prefix}-backend"
  description = "Backend ECS service security group"
  vpc_id      = local.vpc_id

  ingress {
    description     = "Backend traffic from ALB"
    from_port       = 4000
    to_port         = 4000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-backend-sg"
  })
}

resource "aws_security_group" "engine" {
  name        = "${local.name_prefix}-engine"
  description = "Conversational engine ECS service security group"
  vpc_id      = local.vpc_id

  ingress {
    description     = "Engine traffic from ALB"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "Internal backend to engine traffic"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-engine-sg"
  })
}

resource "aws_vpc_security_group_ingress_rule" "rds_backend" {
  count = var.existing_rds_security_group_id == "" ? 0 : 1

  security_group_id            = var.existing_rds_security_group_id
  referenced_security_group_id = aws_security_group.backend.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "Backend ECS access to existing RDS"
}

resource "aws_vpc_security_group_ingress_rule" "rds_engine" {
  count = var.existing_rds_security_group_id == "" ? 0 : 1

  security_group_id            = var.existing_rds_security_group_id
  referenced_security_group_id = aws_security_group.engine.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "Conversational engine ECS access to existing RDS"
}
