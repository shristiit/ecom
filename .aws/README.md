# AWS Artifacts

Terraform under [`ops/terraform`](/Users/Apple/Desktop/ecom/ops/terraform) is the source of truth for the production AWS stack.

The deployment workflow updates ECS task definitions dynamically from the live task family, so the repository no longer relies on checked-in static task-definition JSON files for release rollout.
