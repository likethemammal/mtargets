@ux @cost @reliability @quality
Feature: Checkout quality bar
  Checkout should be fast on mobile, reliable under normal traffic,
  cheap enough to operate, and not regress agent-assisted flows.

  @channel-ux
  Scenario: lcp-good
    Given subject checkout-web
    When indicator lcp is aggregated p75 over ci
    Then objective lcp-good expects lte 2500 ms with severity error

  @channel-ux
  Scenario: cls-good
    Given subject checkout-web
    When indicator cls is aggregated p75 over ci
    Then objective cls-good expects lte 0.1 1 with severity error

  @channel-ux
  Scenario: js-budget
    Given subject checkout-web
    When indicator js-bytes is aggregated sum over run
    Then objective js-budget expects lte 170 KiB with severity warn

  @channel-reliability
  Scenario: api-latency
    Given subject checkout-api
    When indicator api_p95 is aggregated p95 over rolling 5m
    Then objective api-latency expects lt 500 ms with severity error
    And compliance target is 0.99

  @channel-reliability
  Scenario: api-errors
    Given subject checkout-api
    When indicator api_error_rate is aggregated rate over rolling 5m
    Then objective api-errors expects lt 0.01 1 with severity error

  @channel-quality
  Scenario: eval-bar
    Given subject checkout-agent
    When indicator agent_smoke is aggregated pass_rate over run
    Then objective eval-bar expects gte 1 1 with severity error

  @channel-cost
  Scenario: spend-soft
    Given suite scope
    When indicator monthly_spend is aggregated sum over calendar
    Then objective spend-soft expects lte 100 USD with severity warn

  @channel-cost
  Scenario: spend-hard
    Given suite scope
    When indicator monthly_spend is aggregated sum over calendar
    Then objective spend-hard expects lte 150 USD with severity error

  Scenario: Composite May ship?
    Given composite mode score
    And member objective lcp-good weight 2
    And member objective cls-good weight 2
    And member objective api-errors (key) weight 3
    And member objective eval-bar (key) weight 2
    And member objective js-budget weight 1
    Then total score pass threshold is 0.9
