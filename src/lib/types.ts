export interface ArchComponent {
  id: string;
  name: string;
  service: string;
  description: string;
  cost: string;
  security: string;
  box_2d?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  center_point?: [number, number]; // [y, x] 0-1000
  bounding_box?: [number, number, number, number];
}

export interface SimulationParameter {
  id: string;
  label: string;
  min: number;
  max: number;
  default_value: number;
  unit: string;
}

export interface InteractiveResponse {
  cost_estimate: string;
  cost_details: string;
  security_score: number;
  security_summary: string;
  terraform_skeleton: string;
  simulation_parameters?: SimulationParameter[];
  components: ArchComponent[];
}

export interface ScalingResult {
  service: string;
  previous_instances: number;
  new_instances: number;
}

export interface LatencyPrediction {
  tier: string;
  latency_ms: number;
}

export interface CostBreakdown {
  service: string;
  monthly_cost: number;
  primary_region_cost?: number;
  secondary_region_cost?: number;
}

export interface OptimizationSuggestion {
  title: string;
  description: string;
  cost_reduction_percentage?: number;
  current_instance?: string;
  recommended_instance?: string;
}

export interface CarbonFootprint {
  estimated_co2_kg: number;
  optimization_suggestion: string;
  potential_reduction_percentage: number;
}

export interface InfrastructureLimit {
  service: string;
  limit_description: string;
  threshold_value: number;
}

export interface SimulationReport {
  impact_summary: string;
  bottlenecks: string[];
  bottleneck_components: string[]; // IDs matching components array
  cost_impact: string;
  scaling_suggestions: string[];
  
  // Phase 6 Advanced Metrics
  scaling_result: ScalingResult[];
  latency_prediction: LatencyPrediction[];
  cost_breakdown: CostBreakdown[];
  optimizations: OptimizationSuggestion[];
  carbon_footprint: CarbonFootprint;
  infrastructure_limits: InfrastructureLimit[];
}

