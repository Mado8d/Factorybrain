/**
 * FactoryBrain Firmware — Main Entry Point
 *
 * Build with:
 *   idf.py -DNODE_TYPE=VIBESENSE build flash monitor
 *   idf.py -DNODE_TYPE=ENERGYSENSE build flash monitor
 */

#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_system.h"
#include "nvs_flash.h"
#include "esp_event.h"

#include "wifi_manager.h"
#include "mqtt_client.h"
#include "config_manager.h"
#include "ota_manager.h"

#ifdef NODE_TYPE_VIBESENSE
#include "sensor_accel.h"
#include "sensor_current.h"
#include "dsp_fft.h"
#include "anomaly_engine.h"
#endif

#ifdef NODE_TYPE_ENERGYSENSE
#include "sensor_ct.h"
#include "sensor_voltage.h"
#include "power_calc.h"
#include "relay_controller.h"
#include "peak_monitor.h"
#endif

static const char *TAG = "FB_MAIN";

// ============================================================
// Task: Sensor reading (Core 0)
// ============================================================
static void sensor_task(void *pvParameters)
{
    ESP_LOGI(TAG, "Sensor task started on core %d", xPortGetCoreID());

    while (1) {
#ifdef NODE_TYPE_VIBESENSE
        // Read accelerometer via SPI DMA
        accel_reading_t accel = sensor_accel_read();

        // Read current sensor via ADC
        float current_rms = sensor_current_read_rms();

        // Store in ring buffer for DSP task
        // ring_buffer_push(&accel);
#endif

#ifdef NODE_TYPE_ENERGYSENSE
        // Read CT clamps via ADS1115 (4 channels)
        ct_reading_t ct = sensor_ct_read_all();

        // Read AC voltage
        float voltage = sensor_voltage_read_rms();

        // Calculate power for each channel
        // power_calc_update(&ct, voltage);
#endif

        // 100 Hz sample rate for VibeSense, 10 Hz for EnergySense
#ifdef NODE_TYPE_VIBESENSE
        vTaskDelay(pdMS_TO_TICKS(10));   // 100 Hz
#else
        vTaskDelay(pdMS_TO_TICKS(100));  // 10 Hz
#endif
    }
}

// ============================================================
// Task: DSP / Processing (Core 1)
// ============================================================
static void processing_task(void *pvParameters)
{
    ESP_LOGI(TAG, "Processing task started on core %d", xPortGetCoreID());

    while (1) {
#ifdef NODE_TYPE_VIBESENSE
        // Run 1024-point FFT on buffered accelerometer data
        // fft_result_t fft = dsp_fft_compute();

        // Extract features: RMS, dominant freq, crest factor
        // features_t features = dsp_extract_features(&fft);

        // Run TFLite anomaly detection
        // float anomaly_score = anomaly_engine_infer(&features);
#endif

#ifdef NODE_TYPE_ENERGYSENSE
        // Calculate 15-second averages
        // energy_summary_t summary = power_calc_summarize();

        // Update quarter-hour peak tracking
        // peak_monitor_update(&summary);

        // Check relay control decisions
        // relay_controller_evaluate(&summary);
#endif

        vTaskDelay(pdMS_TO_TICKS(1000));  // 1 Hz processing
    }
}

// ============================================================
// Task: Communication (Core 0)
// ============================================================
static void comms_task(void *pvParameters)
{
    ESP_LOGI(TAG, "Comms task started on core %d", xPortGetCoreID());

    while (1) {
        // Serialize telemetry to JSON
        // char *json = telemetry_serialize();

        // Publish to MQTT
        // fb_mqtt_publish(topic, json);

        // Check for incoming commands (config, OTA)
        // fb_mqtt_process_commands();

        // Normal interval: every 60 seconds
        // On anomaly: immediate publish
        vTaskDelay(pdMS_TO_TICKS(60000));
    }
}

// ============================================================
// App main
// ============================================================
void app_main(void)
{
#ifdef NODE_TYPE_VIBESENSE
    ESP_LOGI(TAG, "=== FactoryBrain VibeSense Node ===");
#elif defined(NODE_TYPE_ENERGYSENSE)
    ESP_LOGI(TAG, "=== FactoryBrain EnergySense Node ===");
#endif
    ESP_LOGI(TAG, "Firmware version: 1.0.0");
    ESP_LOGI(TAG, "Free heap: %lu bytes", esp_get_free_heap_size());

    // Initialize NVS (for WiFi credentials & config)
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // Initialize event loop
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    // Load configuration from NVS
    config_manager_init();

    // Connect to WiFi
    wifi_manager_init();

    // Initialize MQTT client
    fb_mqtt_init();

    // Initialize OTA handler
    ota_manager_init();

#ifdef NODE_TYPE_VIBESENSE
    // Initialize VibeSense sensors
    sensor_accel_init();
    sensor_current_init();
    dsp_fft_init();
    anomaly_engine_init();
#endif

#ifdef NODE_TYPE_ENERGYSENSE
    // Initialize EnergySense sensors
    sensor_ct_init();
    sensor_voltage_init();
    power_calc_init();
    relay_controller_init();
    peak_monitor_init();
#endif

    // Start FreeRTOS tasks
    // Pin sensor task to Core 0, processing to Core 1
    xTaskCreatePinnedToCore(sensor_task,     "sensor",     4096, NULL, 5, NULL, 0);
    xTaskCreatePinnedToCore(processing_task, "processing", 8192, NULL, 4, NULL, 1);
    xTaskCreatePinnedToCore(comms_task,      "comms",      4096, NULL, 3, NULL, 0);

    ESP_LOGI(TAG, "All tasks started. System running.");
}
