resource "aws_ecr_repository" "backend" {
  name                 = local.backend_ecr_repository
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_ecr_repository" "engine" {
  name                 = local.engine_ecr_repository
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/aws/ecs/${local.backend_service}"
  retention_in_days = 30

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "engine" {
  name              = "/aws/ecs/${local.engine_service}"
  retention_in_days = 30

  tags = local.common_tags
}

resource "aws_ssm_parameter" "backend" {
  for_each = local.backend_ssm_parameters

  name      = "/${var.project}/${var.environment}/backend/${each.key}"
  type      = "String"
  value     = each.value
  overwrite = true

  tags = local.common_tags
}

resource "aws_ssm_parameter" "engine" {
  for_each = local.engine_ssm_parameters

  name      = "/${var.project}/${var.environment}/engine/${each.key}"
  type      = "String"
  value     = each.value
  overwrite = true

  tags = local.common_tags
}

resource "aws_ssm_parameter" "admin" {
  for_each = local.admin_ssm_parameters

  name      = "/${var.project}/${var.environment}/admin/${each.key}"
  type      = "String"
  value     = each.value
  overwrite = true

  tags = local.common_tags
}

resource "aws_ssm_parameter" "landing" {
  for_each = local.landing_ssm_parameters

  name      = "/${var.project}/${var.environment}/landing/${each.key}"
  type      = "String"
  value     = each.value
  overwrite = true

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "backend" {
  for_each = local.backend_secret_names

  name                    = "${var.project}/${var.environment}/backend/${each.value}"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "engine" {
  for_each = local.engine_secret_names

  name                    = "${var.project}/${var.environment}/engine/${each.value}"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_service_discovery_private_dns_namespace" "main" {
  name = local.namespace_name
  vpc  = local.vpc_id

  tags = local.common_tags
}

resource "aws_service_discovery_service" "engine" {
  name = "conversational-engine"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = local.common_tags
}

resource "aws_ecs_cluster" "main" {
  name = local.ecs_cluster_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "backend" {
  family                   = local.backend_family_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.backend_task.arn

  container_definitions = jsonencode([
    {
      name      = local.backend_container_name
      image     = "${aws_ecr_repository.backend.repository_url}:${var.backend_image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = 4000
          hostPort      = 4000
          protocol      = "tcp"
        }
      ]
      secrets = concat(
        [
          for key in sort(keys(aws_ssm_parameter.backend)) : {
            name      = key
            valueFrom = aws_ssm_parameter.backend[key].arn
          }
        ],
        [
          for key in sort(tolist(local.backend_secret_names)) : {
            name      = key
            valueFrom = aws_secretsmanager_secret.backend[key].arn
          }
        ]
      )
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.backend.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "engine" {
  family                   = local.engine_family_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.engine_task.arn

  container_definitions = jsonencode([
    {
      name      = local.engine_container_name
      image     = "${aws_ecr_repository.engine.repository_url}:${var.engine_image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = 8000
          hostPort      = 8000
          protocol      = "tcp"
        }
      ]
      secrets = concat(
        [
          for key in sort(keys(aws_ssm_parameter.engine)) : {
            name      = key
            valueFrom = aws_ssm_parameter.engine[key].arn
          }
        ],
        [
          for key in sort(tolist(local.engine_secret_names)) : {
            name      = key
            valueFrom = aws_secretsmanager_secret.engine[key].arn
          }
        ]
      )
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.engine.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_service" "backend" {
  name            = local.backend_service
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.backend_desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    assign_public_ip = true
    security_groups  = [aws_security_group.backend.id]
    subnets          = local.public_subnet_ids
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = local.backend_container_name
    container_port   = 4000
  }

  health_check_grace_period_seconds = 30

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }

  depends_on = [aws_lb_listener.https]

  tags = local.common_tags
}

resource "aws_ecs_service" "engine" {
  name            = local.engine_service
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.engine.arn
  desired_count   = var.engine_desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    assign_public_ip = true
    security_groups  = [aws_security_group.engine.id]
    subnets          = local.public_subnet_ids
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.engine.arn
    container_name   = local.engine_container_name
    container_port   = 8000
  }

  service_registries {
    registry_arn = aws_service_discovery_service.engine.arn
  }

  health_check_grace_period_seconds = 30

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }

  depends_on = [aws_lb_listener.https]

  tags = local.common_tags
}

resource "aws_appautoscaling_target" "backend" {
  max_capacity       = 3
  min_capacity       = 1
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "backend_cpu" {
  name               = "${local.backend_service}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend.resource_id
  scalable_dimension = aws_appautoscaling_target.backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value       = 60
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_target" "engine" {
  max_capacity       = 2
  min_capacity       = 1
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.engine.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "engine_cpu" {
  name               = "${local.engine_service}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.engine.resource_id
  scalable_dimension = aws_appautoscaling_target.engine.scalable_dimension
  service_namespace  = aws_appautoscaling_target.engine.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value       = 60
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
  }
}
