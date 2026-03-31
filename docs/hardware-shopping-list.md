# FactoryBrain — Hardware Shopping List (Final)

## Your Questions Answered

**Q: 5V DIN rail power supply needed or already on the list?**
Yes, needed for EnergySense (it goes inside an electrical panel on 230V mains). Added to the list below. The HLK-PM01 AC-DC module converts 230V→5V. For VibeSense, a simple USB power supply or USB from the machine's control panel is fine.

**Q: Other sensors needed?**
No — the list is complete for the MVP. Future additions could include:
- Vibration: piezoelectric accelerometer (if you need higher frequency/precision later)
- Energy: 3-phase CT clamps (for industrial 3-phase power)
- Environment: humidity sensor (SHT30), air quality (SGP30)
But none of these are needed now.

**Q: Why ADXL355 over ADXL345?**
The ADXL355 is purpose-built for vibration monitoring. Key differences:
- **9x lower noise**: 25 µg/√Hz vs 230 µg/√Hz — critical for detecting early bearing wear
- **20-bit resolution** vs 10-13 bit — captures subtle harmonics in FFT analysis
- **Hermetic ceramic package** — stable in humid/dusty factory environments
- **Built-in temperature sensor** — one less external component needed
- **Better offset stability** — baseline doesn't drift with temperature
The ADXL345 is a consumer chip (phones, fitness trackers). The ADXL355 is industrial-grade.
Tradeoff: ~12 EUR more per sensor and less common on AliExpress as breakout boards.

---

## Wiring Scheme

### VibeSense Node (Vibration Monitoring)
```
                    ESP32-S3-DevKitC-1
                    ┌─────────────────┐
    ADXL355 ──SPI──►│ GPIO11 (MOSI)   │
    (accel)  ◄─────│ GPIO13 (MISO)   │
             ──────►│ GPIO12 (SCLK)   │
             ──────►│ GPIO10 (CS)     │
             ──────►│ GPIO4  (INT1)   │  ← FIFO watermark interrupt
                    │                 │
    ACS712 ──ADC──►│ GPIO1  (ADC1)   │  ← via 10k+10k voltage divider!
    (current)       │                 │
                    │                 │
    DS18B20 ─1Wire─►│ GPIO38 (DATA)   │  ← 4.7k pullup to 3.3V
    (temp)          │                 │
                    │ USB-C (5V in)   │  ← power supply
                    └─────────────────┘
    
    Power: USB-C 5V → board LDO → 3.3V for sensors
    ACS712 powered from 5V pin (needs voltage divider on output!)
```

### EnergySense Node (Energy Monitoring)
```
                    ESP32-S3-DevKitC-1
                    ┌─────────────────┐
    ADS1115 ──I2C──►│ GPIO8  (SDA)    │
    (16-bit ADC)    │ GPIO9  (SCL)    │
       │                              │
       ├── Ch0: SCT-013 CT clamp 1    │  (Kanaal 1)
       ├── Ch1: SCT-013 CT clamp 2    │  (Kanaal 2)
       ├── Ch2: SCT-013 CT clamp 3    │  (Kanaal 3)
       └── Ch3: ZMPT101B voltage      │  (AC voltage measurement)
                                      │
    SCT-013 ──────► ADS1115 Ch0-2     │  ← 4th CT on second ADS1115 if needed
    (CT clamps)                       │
                                      │
    DS18B20 ─1Wire─►│ GPIO38 (DATA)   │  ← 4.7k pullup to 3.3V
    (temp)          │                 │
                    │                 │
    Relay ◄──GPIO──│ GPIO39 (OUT)    │  ← load switching
                    │                 │
    HLK-PM01 ──5V──│ 5V pin (VIN)    │  ← 230V AC → 5V DC converter
                    └─────────────────┘
    
    Note: 4th CT clamp needs either:
    - a second ADS1115 (different I2C address: ADDR→VDD)
    - or connect CT clamp 4 directly to ESP32 ADC1 (GPIO1)
```

### Important Wiring Notes
- **ACS712 voltage divider**: The ACS712 outputs 0-5V but ESP32 ADC accepts 0-3.1V. Add a 10k+10k resistor divider + 100nF capacitor.
- **SCT-013 burden resistors**: Only needed if you buy the current-output (mA) version. With the 1V output version, connect directly to ADS1115.
- **ADXL355 INT1 pin**: Wire to ESP32 GPIO for FIFO interrupt — avoids polling, saves power.
- **All sensors run at 3.3V** from the ESP32 board's LDO. Only ACS712, relay, and HLK-PM01 need 5V.

---

## Order Tonight — Amazon EU (~55 EUR)

Items you need FAST to start firmware development. Arrives in 2-3 days.

| # | Item | Qty | Est. Price | Notes |
|---|------|-----|-----------|-------|
| 1 | ESP32-S3-DevKitC-1 (N8R2) | 4 | ~24 EUR | 2 for VibeSense, 2 for EnergySense |
| 2 | Breadboard 830-point | 2 | ~8 EUR | One per node type |
| 3 | Jumper wire kit (M-M, M-F, F-F) | 1 | ~7 EUR | 120 pieces mixed |
| 4 | USB-C data cable (not charge-only!) | 2 | ~8 EUR | For programming |
| 5 | Solder wire 0.8mm lead-free | 1 | ~8 EUR | You have soldering iron already |
| | **Amazon subtotal** | | **~55 EUR** | |

---

## Order Tonight — AliExpress (~75 EUR)

Sensors and components. Arrives in 2-4 weeks (by then firmware core is ready).

### VibeSense Parts
| # | Item | Qty | Est. Price | Notes |
|---|------|-----|-----------|-------|
| 6 | ADXL355 breakout module | 2 | ~30 EUR | Search "ADXL355 module SPI". If unavailable, get EVAL-ADXL355Z from Mouser (~35 EUR each) |
| 7 | ACS712-30A current sensor module | 2 | ~3 EUR | Hall-effect, 5V powered |
| 8 | DS18B20 waterproof temp sensor | 4 | ~4 EUR | 2 per node type (VibeSense + EnergySense) |
| 9 | 4.7k ohm resistor pack (100pcs) | 1 | ~1 EUR | Pull-up for DS18B20 |
| 10 | 10k ohm resistor pack (100pcs) | 1 | ~1 EUR | Voltage divider for ACS712 |
| 11 | 100nF capacitor pack (50pcs) | 1 | ~1 EUR | Decoupling + ADC filter |
| 12 | Project enclosure IP65 (100x68x50mm) | 2 | ~5 EUR | For VibeSense nodes |

### EnergySense Parts
| # | Item | Qty | Est. Price | Notes |
|---|------|-----|-----------|-------|
| 13 | ADS1115 16-bit ADC breakout (I2C) | 2 | ~4 EUR | 4 channels each |
| 14 | SCT-013-030 CT clamp (30A, **1V output**) | 8 | ~16 EUR | 4 per node. GET THE 1V VERSION! |
| 15 | ZMPT101B AC voltage sensor module | 2 | ~3 EUR | Safe 230V measurement via transformer |
| 16 | 5V relay module (1-channel, with optocoupler) | 2 | ~2 EUR | Load switching |
| 17 | HLK-PM01 5V/2A AC-DC converter | 2 | ~4 EUR | 230V mains → 5V for ESP32. BE CAREFUL! |
| 18 | DIN rail enclosure (4 module width) | 2 | ~5 EUR | Fits in electrical panel |

### Extras
| # | Item | Qty | Est. Price | Notes |
|---|------|-----|-----------|-------|
| 19 | Wire stripper + flush cutters | 1 | ~5 EUR | |
| 20 | Helping hands / third hand | 1 | ~5 EUR | Holds PCB while soldering |
| 21 | Heat shrink tubing assortment | 1 | ~2 EUR | Insulation |
| | **AliExpress subtotal** | | **~91 EUR** | |

---

## Order Later (When PCBs Are Designed)
| Item | Est. Price | Where |
|------|-----------|-------|
| Custom PCB (5 pcs, 2-layer) | ~15 EUR | JLCPCB |
| SMD components for PCB | ~20 EUR | LCSC |
| 3D-printed enclosure (optional) | ~10 EUR | Self-print or JLCPCB |

---

## Total Budget Summary

| Category | Amount |
|----------|--------|
| Amazon EU (tonight) | ~55 EUR |
| AliExpress (tonight) | ~91 EUR |
| **Total tonight** | **~146 EUR** |
| PCBs + SMD (later) | ~45 EUR |
| **Grand total** | **~191 EUR** |

---

## Compatibility Verification Checklist

| Check | Status |
|-------|--------|
| ESP32-S3 SPI works with ADXL355 (3.3V, Mode 0, up to 10MHz) | OK |
| ESP32-S3 ADC1 (GPIO1-10) works with WiFi active | OK |
| ACS712 output needs voltage divider (5V→2.5V) for ESP32 ADC | NEEDS DIVIDER |
| ADS1115 I2C at 3.3V compatible with ESP32-S3 | OK |
| SCT-013-030 (1V output) connects directly to ADS1115 | OK |
| ZMPT101B output goes to ADS1115 channel (not ESP32 ADC) | OK |
| DS18B20 1-Wire works with any GPIO + 4.7k pullup | OK |
| Relay module (5V, optocoupler) driven by ESP32 GPIO | OK |
| USB-C 5V powers board + all sensors (~350mA total) | OK |
| All GPIOs fit: VibeSense needs 6, EnergySense needs 4, board has ~30 | OK |

---

## Safety Warnings

- **230V AC is LETHAL.** The HLK-PM01 and ZMPT101B handle mains voltage. Only work on these components when power is disconnected.
- **CT clamps (SCT-013) are safe** — they clip around a wire without breaking the circuit. No direct contact with mains.
- **Insulate all exposed connections** with heat shrink tubing.
- **For the EnergySense production version**: have the electrical installation reviewed by a qualified electrician.
