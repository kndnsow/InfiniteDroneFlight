# kndnsow/InfiniteDroneFlight

A realistic FPV drone simulator featuring true endless world generation, accurate drone-relative controls, and immersive environmental effects.

## Project Name

**InfiniteDroneFlight**  
An open-world FPV drone simulator with unlimited terrain and authentic flight physics.

## Description

InfiniteDroneFlight is a web-based First-Person View (FPV) drone simulator built with Three.js and realistic physics. It offers:

- True endless grass field generation with dynamic grass, trees, buildings, and clouds  
- Proper drone-relative controls: Roll, Pitch, Yaw mapped to controller axes and always behave according to the drone’s orientation  
- Realistic drone physics: gravity, drag, ground effect, wind turbulence, gyroscopic effects  
- Configurable world boundaries: set maximum distance and altitude  
- Multiple modes:
  - Free Flight: Explore the endless terrain  
  - Gate Racing: 3-2-1 countdown, dynamic gate generation, scoring  
  - Acrobatic Training: Five distinct aerobatic challenges (Power Loop, Barrel Roll, Split-S, Inverted Flight, High-G Turn) with real-time progress tracking  
- Enhanced environment: sky shader, dynamic fog, day-lighting, and shadow mapping  
- Debug panel: displays FPS, draw calls, drone velocity, orientation, HID controller input, and more  

## Live Demo

View the live demo by opening `index.html` in a modern browser.  
Ensure Three.js (r128) is available via CDN.

## Installation

1. Clone the repository & Open `index.html` in your browser. No server required.
   ```bash
   git clone https://github.com/kndnsow/InfiniteDroneFlight.git
   cd InfiniteDroneFlight
   start index.html
   ```

## File Structure

- `index.html` – Main HTML entry point  
- `style.css` – Styling and layout  
- `app.js` – Core simulator logic (physics, input, modes)  
- `README.md` – Project documentation  

## Controls

- Keyboard:  
  - W/S: Throttle up/down  
  - Arrow keys: Pitch/Roll  
  - A/D: Yaw left/right  
  - Space: Arm/Disarm  
  - Esc: Toggle menu  
- Gamepad:  
  - Left stick: Roll (X) and Pitch (Y)  
  - Right stick: Yaw (X) and Throttle (Y)  
  - Button 0: Arm/Disarm  

## Settings

Open the **Settings** panel in the main menu to configure:

- Drone weight, thrust-to-weight ratio, motor response time  
- Physics toggles: gravity, wind, prop wash, gyroscopic effects  
- Control rates, expo, field of view  
- World limits: maximum distance and altitude  
- Debug panel and unlimited battery  

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request.

## License

This project is open source and available under the MIT License.
