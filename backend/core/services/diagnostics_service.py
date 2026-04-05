"""Rule-based diagnostic engine for plain-language machine insights.

Analyzes recent telemetry to detect:
- Trending vibration/temperature/current
- Anomaly persistence
- Threshold proximity
- Predicted time to critical threshold

No ML model needed — uses linear regression on recent data.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def analyze_machine(db: AsyncSession, machine_id: str, tenant_settings: dict) -> list[dict]:
    """Run diagnostics on a machine, return list of plain-language insights."""
    insights = []
    thresholds = tenant_settings.get("thresholds", {})

    # Get sensor nodes for this machine
    result = await db.execute(
        text("""
        SELECT id, node_type FROM sensor_nodes WHERE machine_id = :mid
    """),
        {"mid": machine_id},
    )
    nodes = result.fetchall()

    if not nodes:
        return [
            {
                "type": "info",
                "severity": "info",
                "message": "No sensors assigned to this machine.",
                "metric": None,
            }
        ]

    for node_id, node_type in nodes:
        if node_type == "vibesense":
            insights.extend(await _analyze_vibesense(db, node_id, thresholds))
        elif node_type == "energysense":
            insights.extend(await _analyze_energysense(db, node_id))

    if not insights:
        insights.append(
            {
                "type": "healthy",
                "severity": "success",
                "message": "All parameters within normal range. No issues detected.",
                "metric": None,
            }
        )

    return insights


async def _analyze_vibesense(db: AsyncSession, node_id: str, thresholds: dict) -> list[dict]:
    """Analyze vibration sensor data."""
    insights = []

    # Get last 24h of data with 30-min buckets
    result = await db.execute(
        text("""
        SELECT
            time_bucket(INTERVAL '30 minutes', time) AS bucket,
            AVG(vib_rms_x) AS avg_vib,
            AVG(anomaly_score) AS avg_anomaly,
            AVG(temperature_1) AS avg_temp,
            AVG(current_rms) AS avg_current
        FROM sensor_readings
        WHERE node_id = :nid AND time >= NOW() - INTERVAL '24 hours'
        GROUP BY bucket ORDER BY bucket
    """),
        {"nid": node_id},
    )
    rows = result.fetchall()

    if len(rows) < 4:
        return []

    # Extract series
    vibs = [r.avg_vib for r in rows if r.avg_vib is not None]
    anomalies = [r.avg_anomaly for r in rows if r.avg_anomaly is not None]
    temps = [r.avg_temp for r in rows if r.avg_temp is not None]
    [r.avg_current for r in rows if r.avg_current is not None]

    # Vibration trend analysis
    if len(vibs) >= 6:
        slope = _linear_slope(vibs)
        current_vib = vibs[-1]
        vib_warning = thresholds.get("vibration_warning", 2.5)
        vib_critical = thresholds.get("vibration_critical", 4.0)

        if slope > 0.02:  # significant upward trend
            pct_change = (slope * len(vibs)) / max(vibs[0], 0.01) * 100
            insights.append(
                {
                    "type": "trend",
                    "severity": "warning",
                    "message": f"Vibration on {node_id} trending up {pct_change:.0f}% over last 24h. Possible bearing wear or misalignment. Monitor closely.",
                    "metric": "vibration",
                    "current_value": round(current_vib, 2),
                    "trend": "increasing",
                }
            )

            # Predict time to critical
            if slope > 0 and current_vib < vib_critical:
                hours_to_critical = (vib_critical - current_vib) / slope
                days = hours_to_critical / (len(vibs) / 24)  # buckets to days
                if days < 30:
                    insights.append(
                        {
                            "type": "prediction",
                            "severity": "warning" if days > 7 else "critical",
                            "message": f"At current rate, vibration on {node_id} reaches critical threshold in ~{days:.0f} days. Schedule preventive maintenance.",
                            "metric": "vibration",
                            "predicted_days_to_critical": round(days, 1),
                        }
                    )

        if current_vib > vib_warning:
            insights.append(
                {
                    "type": "threshold",
                    "severity": "critical" if current_vib > vib_critical else "warning",
                    "message": f"Vibration on {node_id} at {current_vib:.2f}g — {'above critical' if current_vib > vib_critical else 'above warning'} threshold ({vib_warning}g warning, {vib_critical}g critical).",
                    "metric": "vibration",
                    "current_value": round(current_vib, 2),
                }
            )

    # Anomaly persistence
    if len(anomalies) >= 6:
        recent_anomalies = anomalies[-6:]  # last 3 hours
        anomaly_warning = thresholds.get("anomaly_warning", 0.3)
        high_count = sum(1 for a in recent_anomalies if a > anomaly_warning)
        if high_count >= 4:
            insights.append(
                {
                    "type": "anomaly",
                    "severity": "warning",
                    "message": f"Anomaly score on {node_id} persistently elevated ({high_count}/6 readings above threshold). Unusual operating pattern detected.",
                    "metric": "anomaly_score",
                    "current_value": round(anomalies[-1], 3),
                }
            )

    # Temperature trend
    if len(temps) >= 6:
        slope = _linear_slope(temps)
        current_temp = temps[-1]
        temp_warning = thresholds.get("temperature_warning", 60.0)
        if slope > 0.5 and current_temp > temp_warning * 0.8:
            insights.append(
                {
                    "type": "trend",
                    "severity": "warning",
                    "message": f"Temperature on {node_id} rising ({current_temp:.0f}°C, trending up). Check cooling and lubrication.",
                    "metric": "temperature",
                    "current_value": round(current_temp, 1),
                    "trend": "increasing",
                }
            )

    return insights


async def _analyze_energysense(db: AsyncSession, node_id: str) -> list[dict]:
    """Analyze energy sensor data."""
    insights = []

    result = await db.execute(
        text("""
        SELECT
            time_bucket(INTERVAL '1 hour', time) AS bucket,
            AVG(grid_power_w) AS avg_grid,
            AVG(power_factor) AS avg_pf
        FROM sensor_readings
        WHERE node_id = :nid AND time >= NOW() - INTERVAL '24 hours'
        GROUP BY bucket ORDER BY bucket
    """),
        {"nid": node_id},
    )
    rows = result.fetchall()

    if len(rows) < 4:
        return []

    grid_vals = [r.avg_grid for r in rows if r.avg_grid is not None]
    pf_vals = [r.avg_pf for r in rows if r.avg_pf is not None]

    # Power consumption trend
    if len(grid_vals) >= 6:
        _linear_slope(grid_vals)
        current_power = grid_vals[-1]
        avg_power = sum(grid_vals) / len(grid_vals)

        if current_power > avg_power * 1.3:
            insights.append(
                {
                    "type": "consumption",
                    "severity": "warning",
                    "message": f"Power consumption on {node_id} is {((current_power / avg_power) - 1) * 100:.0f}% above 24h average ({current_power / 1000:.1f} kW vs {avg_power / 1000:.1f} kW avg). Possible overload or efficiency drop.",
                    "metric": "grid_power",
                    "current_value": round(current_power, 0),
                }
            )

    # Low power factor
    if pf_vals:
        current_pf = pf_vals[-1]
        if current_pf is not None and current_pf < 0.85:
            insights.append(
                {
                    "type": "efficiency",
                    "severity": "warning",
                    "message": f"Power factor on {node_id} is low ({current_pf:.2f}). Consider power factor correction to reduce energy waste and avoid utility penalties.",
                    "metric": "power_factor",
                    "current_value": round(current_pf, 3),
                }
            )

    return insights


def _linear_slope(values: list[float]) -> float:
    """Calculate the slope of a simple linear regression."""
    n = len(values)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2
    y_mean = sum(values) / n
    numerator = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
    denominator = sum((i - x_mean) ** 2 for i in range(n))
    if denominator == 0:
        return 0.0
    return numerator / denominator
