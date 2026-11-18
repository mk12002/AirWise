# Impact methodology

AirWise never asks the LLM for numbers. Every figure in the UI comes from the deterministic model in
[`src/services/exposure.js`](../src/services/exposure.js), and each recommendation is a set of model changes
("mods") whose before/after difference is the impact you see. Gemini then explains those numbers in plain
language for the specific family.

## 1. Live outdoor air

- **Source:** [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) (Copernicus CAMS
  forecasts, roughly 11 km grid, hourly), plus Open-Meteo weather for wind, temperature and humidity. Both are free
  and need no API key.
- **Outdoor exposure** uses the mean PM2.5 over the next 24 forecast hours.
- **Best and worst windows** are the cleanest and dirtiest contiguous 2-hour blocks between 06:00 and 21:00 local
  time ([`windows.js`](../src/services/windows.js)).
- **AQI** is the provider's US AQI. When it is missing, AQI is computed from PM2.5 with the 2024 US EPA breakpoints
  ([`aqi.js`](../src/services/aqi.js)).

## 2. Indoor air (single-zone mass balance)

```
C_in = (P · a · C_out + G) / (a + k + CADR_eff / V)
```

| Symbol   | Meaning                                 | Value used                                                               |
| -------- | --------------------------------------- | ------------------------------------------------------------------------ |
| P        | Outdoor particle penetration            | 0.8 (0.3 with a filtered fresh-air system)                               |
| a        | Air changes per hour                    | 0.3 sealed · 0.8 typical · 1.0 exhaust fans · 1.5 mechanical             |
| k        | Indoor deposition                       | 0.2 /h                                                                   |
| V        | Home volume                             | floor area × 2.6 m                                                       |
| G        | Indoor source generation                | per-source 24-hour increments (below) × reference removal rate of 1.0 /h |
| CADR_eff | Purifier clean-air delivery, real-world | rated CADR × 0.6 (auto/low modes, bypass, filter loading)                |

A **closed bedroom** with its own air cleaner is modelled as a second zone fed by the living space. It exchanges
air with the rest of the home at 1.0 /h with the door closed and 3 /h with it open.

**Indoor source increments** (24-hour mean µg/m³ added at the reference removal rate):

| Source                           | Increment | Source                                         | Increment |
| -------------------------------- | --------- | ---------------------------------------------- | --------- |
| Wood / dung / crop-waste cooking | 250       | Wood / coal heating                            | 80        |
| Coal cooking                     | 150       | Kerosene heater                                | 40        |
| Kerosene cooking                 | 60        | Indoor smoking                                 | 30        |
| LPG / piped gas                  | 10 / 8    | Incense / mosquito coils                       | 15        |
| Induction                        | 3         | Resuspended dust (halved by daily wet mopping) | 8         |

These follow WHO household-air-pollution ranges and published Indian and Chinese kitchen and incense
measurements. They are conservative central estimates.

The model also reports when a measure **doesn't** help. Sealing drafts only lowers indoor PM2.5 when
`P · C_out · k > G`, that is, when outdoor smog outweighs indoor sources. In a home that burns incense, a tighter
envelope traps the smoke, so AirWise leaves that action out instead of recommending it.

## 3. Personal exposure and dose

Each household member's day is split across micro-environments (hours per day):

| Group       | Bedroom | Outdoors | Commute                      | Rest of home | Breathing (m³/h)      |
| ----------- | ------- | -------- | ---------------------------- | ------------ | --------------------- |
| Adult       | 8       | 1.5      | from distance, days and mode | remainder    | 0.65 (2.5 exercising) |
| Child       | 10      | 3        | –                            | remainder    | 0.45                  |
| Older adult | 9       | 1        | –                            | remainder    | 0.55                  |

- One outdoor hour is the "timed" hour: the workout, if the family exercises, otherwise errands and play. Timing
  actions move that hour into the cleanest window.
- In-transit exposure multiplies outdoor PM2.5 by a mode factor: metro 0.6, car with windows up 0.8, bus 1.1,
  walk or cycle 1.2, two-wheeler 1.3.
- **Daily dose** = Σ hours × concentration × breathing rate.
- **Cigarette equivalent** uses the Berkeley Earth rule of thumb that breathing 22 µg/m³ for 24 h is about one
  cigarette. It is a communication aid, not a toxicological equivalence.

## 4. Health framing

- **WHO multiple**: personal mean exposure ÷ 15 µg/m³ (the WHO 2021 24-hour guideline).
- **Life expectancy if sustained**: the [Air Quality Life Index](https://aqli.epic.uchicago.edu/) estimates that
  each sustained 1 µg/m³ of PM2.5 costs about 0.098 years of life expectancy. AirWise applies it to each member's
  exposure reduction, with both concentrations **clamped to 5–120 µg/m³**, the range the relationship is calibrated
  on. Extreme indoor-smoke cases (such as biomass kitchens at 300+ µg/m³) therefore never produce implausible
  figures. It is labelled "if sustained year-round" because the AQLI describes long-term exposure, not one day.

## 5. CO2e

| Item                       | Factor                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| Commute (kg/passenger-km)  | petrol/diesel car 0.17 · CNG 0.13 · auto/taxi 0.10 · two-wheeler 0.06 · EV 0.05 · bus 0.04 · metro 0.03 |
| Idling                     | 0.6 L/h petrol, about 10 min per commuting day, 2.3 kg CO2/L                                            |
| Cooking (kg/day/household) | LPG 1.4 · piped gas 1.2 · induction 1.1 (at 0.7 kg/kWh grid) · kerosene 1.9 · coal 3.5                  |
| Heating (kg/day)           | electric 4 · gas 3 · kerosene 4.5 · wood/coal 6                                                         |
| Grid electricity           | 0.7 kg/kWh                                                                                              |

Moving from wood to LPG **adds** a little fossil CO2 but removes the most harmful indoor smoke. AirWise keeps such
health-first trade-offs and labels them; it drops only actions that add CO2 with no health benefit.

## 6. Whole-plan impact and the what-if simulator

The mods of all recommended actions are merged (strongest purifier, cleanest fuel, lowest-carbon commute, and so
on) and the model runs once more. Impacts are therefore **combined, not summed**, so overlapping actions are never
double-counted. A second "free actions only" run shows what a family can do today without spending anything.

The **what-if simulator** (`POST /api/simulate`) runs the same merge for whichever actions the family toggles on, so
the impact card always reflects the choices they actually intend to make.

## Limitations

- CAMS forecasts are about 11 km resolution, so street-level hotspots (busy roads, construction) can be worse.
- Homes vary widely. The model is for **comparing options**, not for measuring your home. A low-cost PM2.5 monitor
  is the best next step.
- This is not medical advice. People with symptoms should see a doctor.
