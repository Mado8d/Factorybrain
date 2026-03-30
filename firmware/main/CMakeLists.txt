set(CORE_SRCS
    "../core/mqtt_client.c"
    "../core/wifi_manager.c"
    "../core/config_manager.c"
    "../core/ota_manager.c"
    "../core/telemetry_serializer.c"
    "../core/ring_buffer.c"
)

if(NODE_TYPE_VIBESENSE)
    set(NODE_SRCS
        "../vibesense/sensor_accel.c"
        "../vibesense/sensor_current.c"
        "../vibesense/dsp_fft.c"
        "../vibesense/anomaly_engine.c"
    )
elseif(NODE_TYPE_ENERGYSENSE)
    set(NODE_SRCS
        "../energysense/sensor_ct.c"
        "../energysense/sensor_voltage.c"
        "../energysense/power_calc.c"
        "../energysense/relay_controller.c"
        "../energysense/peak_monitor.c"
    )
endif()

idf_component_register(
    SRCS "main.c" ${CORE_SRCS} ${NODE_SRCS}
    INCLUDE_DIRS "." "../core" "../vibesense" "../energysense" "../components"
    REQUIRES
        esp_wifi
        esp_event
        nvs_flash
        mqtt
        esp_http_client
        esp_https_ota
        json
        esp_timer
        driver
)
