const PHYSICS = {
    GRAVITY: 9.81, 
    AIR_DENSITY: 1.225, 
    DRAG_COEFFICIENT: 0.6, 
    PROP_DISC_AREA: 0.02, 
    MOTOR_TIME_CONSTANT: 0.03, 
    GYROSCOPIC_FACTOR: 0.01, 
    WIND_TURBULENCE: 0.5, 
    GROUND_EFFECT_HEIGHT: 2.0 
};

const DRONE_SPECS = {
    MASS: 0.8, 
    INERTIA_XX: 0.007, 
    INERTIA_YY: 0.007, 
    INERTIA_ZZ: 0.012, 
    ARM_LENGTH: 0.125, 
    THRUST_TO_WEIGHT: 5.0, 
    MAX_THRUST_PER_MOTOR: 9.81, 
    HOVER_THRUST_PER_MOTOR: 1.96, 
    BATTERY_CAPACITY: 1300, 
    BATTERY_VOLTAGE: 16.8, 
    MOTOR_KV: 2300 
};

const RATES = {
    BEGINNER: { max: 400, center: 100, expo: 0.5 },
    INTERMEDIATE: { max: 700, center: 150, expo: 0.3 },
    RACING: { max: 1000, center: 200, expo: 0.2 }
};

const ACTIONS = {
    THROTTLE_UP: 'throttle_up',
    THROTTLE_DOWN: 'throttle_down',
    PITCH_FWD: 'pitch_fwd',
    PITCH_BACK: 'pitch_back',
    ROLL_L: 'roll_left',
    ROLL_R: 'roll_right',
    YAW_L: 'yaw_left',
    YAW_R: 'yaw_right',
    ARM_DISARM: 'arm_disarm',
    MENU_TOGGLE: 'menu_toggle'
};

const id = (sel) => document.getElementById(sel);
const qsa = (sel) => document.querySelectorAll(sel);

class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x; this.y = y; this.z = z;
    }
    add(v) { return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z); }
    multiply(scalar) { return new Vector3(this.x * scalar, this.y * scalar, this.z * scalar); }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    normalize() {
        const len = this.length();
        return len > 0 ? new Vector3(this.x/len, this.y/len, this.z/len) : new Vector3(0,0,0);
    }
}

class RealisticInputManager {
    constructor() {
        console.log('[INPUT] Initializing Fixed Input Manager...');
        this.state = Object.fromEntries(Object.values(ACTIONS).map(a => [a, false]));
        this.analogInputs = {
            roll: 0, pitch: 0, yaw: 0, throttle: 0
        };
        this._deadZone = 0.05;
        this._neutral = null;
        this._hid = null;
        this.rates = RATES.INTERMEDIATE;
        this.expo = 0.3;
        this.lastHIDPacket = null;

        
        this._keyMap = {
            'w': ACTIONS.THROTTLE_UP,
            's': ACTIONS.THROTTLE_DOWN,
            'ArrowUp': ACTIONS.PITCH_FWD,
            'ArrowDown': ACTIONS.PITCH_BACK,
            'ArrowLeft': ACTIONS.ROLL_L,
            'ArrowRight': ACTIONS.ROLL_R,
            'a': ACTIONS.YAW_L,
            'd': ACTIONS.YAW_R,
            ' ': ACTIONS.ARM_DISARM,
            'Escape': ACTIONS.MENU_TOGGLE
        };

        this._bindKeyboard();
        this._bindHID();
        console.log('[INPUT] Fixed Input Manager ready');
    }

    _bindKeyboard() {
        window.addEventListener('keydown', (e) => {
            const action = this._keyMap[e.key];
            if (action) {
                this.state[action] = true;
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            const action = this._keyMap[e.key];
            if (action) {
                this.state[action] = false;
                e.preventDefault();
            }
        });
    }

    _bindHID() {
        const hidButton = id('connect-hid');
        if (!hidButton) return;
        hidButton.addEventListener('click', async () => {
            try {
                const devices = await navigator.hid.requestDevice({ filters: [] });
                if (devices.length === 0) return;
                this._hid = devices[0];
                await this._hid.open();
                this._hid.addEventListener('inputreport', (event) => {
                    const data = new Uint8Array(event.data.buffer);
                    this._parseHIDData(data);
                });
                console.log(`[INPUT] HID device connected: ${this._hid.productName}`);
            } catch (error) {
                console.error('[INPUT] HID connection failed:', error);
            }
        });
    }

    _parseHIDData(data) {
        
        const rawRoll = (data[0] - 127) / 127;
        const rawPitch = (data[1] - 127) / 127;
        const rawYaw = (data[2] - 127) / 127;
        const rawThrottle = data[3] / 255;
        
        this.analogInputs.roll = this._applyRateCurve(rawRoll);
        this.analogInputs.pitch = this._applyRateCurve(rawPitch);
        this.analogInputs.yaw = this._applyRateCurve(rawYaw);
        this.analogInputs.throttle = rawThrottle;
    }

    _pollGamepads() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let activeCount = 0;
        for (let i = 0; i < gamepads.length; i++) {
            const gamepad = gamepads[i];
            if (!gamepad) continue;
            activeCount++;

            
            if (gamepad.buttons[0]) {
                this.state[ACTIONS.ARM_DISARM] = gamepad.buttons[0].pressed;
            }
            
            
            if (gamepad.axes.length >= 4) {
                
                const rawPitch = this._applyDeadzone(-gamepad.axes[0]);
                const rawRoll = this._applyDeadzone(-gamepad.axes[1]); 
                
                const rawYaw = this._applyDeadzone(-gamepad.axes[2]);
                const rawThrottle = Math.max(0, (-gamepad.axes[3] + 1) / 2);

                
                this.analogInputs.roll = this._applyRateCurve(rawRoll);
                this.analogInputs.pitch = this._applyRateCurve(rawPitch);
                this.analogInputs.yaw = this._applyRateCurve(rawYaw);
                this.analogInputs.throttle = rawThrottle;

                this.lastHIDPacket = {
                    roll: rawRoll.toFixed(2),
                    pitch: rawPitch.toFixed(2),
                    yaw: rawYaw.toFixed(2),
                    throttle: rawThrottle.toFixed(2)
                };
            }
        }
        return activeCount;
    }

    getLastHIDPacket() { return this.lastHIDPacket; }

    _applyDeadzone(value) {
        if (Math.abs(value) < this._deadZone) return 0;
        const sign = Math.sign(value);
        return sign * ((Math.abs(value) - this._deadZone) / (1 - this._deadZone));
    }

    _applyRateCurve(input) {
        if (Math.abs(input) < 0.01) return 0;
        const sign = Math.sign(input);
        const absInput = Math.abs(input);
        
        
        const expoOutput = absInput * (1 - this.expo) + Math.pow(absInput, 3) * this.expo;
        
        
        const centerRate = this.rates.center * Math.PI / 180; 
        const maxRate = this.rates.max * Math.PI / 180;
        
        let output;
        if (absInput < 0.5) {
            output = expoOutput * 2 * centerRate;
        } else {
            const centerContrib = centerRate;
            const maxContrib = (expoOutput - 0.5) * 2 * (maxRate - centerRate);
            output = centerContrib + maxContrib;
        }
        
        return sign * output;
    }

    update() {
        const controllerCount = this._pollGamepads();
        
        
        if (this.state[ACTIONS.ROLL_L]) this.analogInputs.roll = -this.rates.max * Math.PI / 180;
        else if (this.state[ACTIONS.ROLL_R]) this.analogInputs.roll = this.rates.max * Math.PI / 180;
        else if (!this._hasAnalogInput()) this.analogInputs.roll = 0;
        
        if (this.state[ACTIONS.PITCH_FWD]) this.analogInputs.pitch = this.rates.max * Math.PI / 180;
        else if (this.state[ACTIONS.PITCH_BACK]) this.analogInputs.pitch = -this.rates.max * Math.PI / 180;
        else if (!this._hasAnalogInput()) this.analogInputs.pitch = 0;
        
        if (this.state[ACTIONS.YAW_L]) this.analogInputs.yaw = -this.rates.max * Math.PI / 180;
        else if (this.state[ACTIONS.YAW_R]) this.analogInputs.yaw = this.rates.max * Math.PI / 180;
        else if (!this._hasAnalogInput()) this.analogInputs.yaw = 0;
        
        if (this.state[ACTIONS.THROTTLE_UP]) this.analogInputs.throttle = Math.min(1, this.analogInputs.throttle + 0.02);
        else if (this.state[ACTIONS.THROTTLE_DOWN]) this.analogInputs.throttle = Math.max(0, this.analogInputs.throttle - 0.02);
        
        return controllerCount;
    }

    _hasAnalogInput() {
        return this._pollGamepads() > 0 || this._hid !== null;
    }

    calibrate() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (let i = 0; i < gamepads.length; i++) {
            const gamepad = gamepads[i];
            if (gamepad && gamepad.axes.length >= 4) {
                this._neutral = [...gamepad.axes];
                console.log('[INPUT] Controller calibrated');
                return true;
            }
        }
        return false;
    }

    setRates(rateProfile) {
        this.rates = rateProfile;
        console.log(`[INPUT] Rates updated: max=${this.rates.max}°/s`);
    }

    getAnalogInputs() { return this.analogInputs; }
    getState() { return this.state; }
    hasHID() { return this._hid !== null; }
}

class RealisticDrone {
    constructor(mesh) {
        this.mesh = mesh;
        
        this.mass = DRONE_SPECS.MASS;
        this.inertia = {
            xx: DRONE_SPECS.INERTIA_XX,
            yy: DRONE_SPECS.INERTIA_YY,
            zz: DRONE_SPECS.INERTIA_ZZ
        };

        
        this.position = new THREE.Vector3(0, 2, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.angularVelocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = new THREE.Vector3(0, 0, 0);

        
        this.motorSpeeds = [0, 0, 0, 0]; 
        this.motorTargets = [0, 0, 0, 0]; 
        this.motorThrusts = [0, 0, 0, 0]; 

        
        this.armed = false;
        this.throttleInput = 0;
        this.battery = 100;
        this.batteryVoltage = DRONE_SPECS.BATTERY_VOLTAGE;
        this.totalFlightTime = 0;
        this.maxGForce = 1.0;

        
        this.enableWind = true;
        this.enablePropWash = true;
        this.enableGyroscopic = true;
        this.enableRealisticGravity = true;

        
        this.windVelocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 2
        );
        this.windTime = 0;

        console.log('[DRONE] Realistic drone physics initialized');
        console.log(`[DRONE] Mass: ${this.mass}kg, TWR: ${DRONE_SPECS.THRUST_TO_WEIGHT}:1`);
    }

    setMass(mass) {
        this.mass = mass;
        
        const scale = mass / DRONE_SPECS.MASS;
        this.inertia.xx = DRONE_SPECS.INERTIA_XX * scale;
        this.inertia.yy = DRONE_SPECS.INERTIA_YY * scale;
        this.inertia.zz = DRONE_SPECS.INERTIA_ZZ * scale;
        console.log(`[DRONE] Mass updated to ${mass}kg`);
    }

    armDisarm() {
        this.armed = !this.armed;
        if (!this.armed) {
            
            this.motorTargets = [0, 0, 0, 0];
            this.throttleInput = 0;
        }
        console.log(`[DRONE] ${this.armed ? 'ARMED' : 'DISARMED'}`);
    }

    applyControls(analogInputs, deltaTime) {
        if (!this.armed) {
            this.motorTargets = [0, 0, 0, 0];
            return;
        }

        
        
        const rollRateWorld = analogInputs.roll;
        const pitchRateWorld = analogInputs.pitch;
        const yawRateWorld = analogInputs.yaw;
        this.throttleInput = analogInputs.throttle;

        
        const droneEuler = new THREE.Euler().setFromQuaternion(this.mesh.quaternion);
        const yaw = droneEuler.y;
        
        
        const cosYaw = Math.cos(yaw);
        const sinYaw = Math.sin(yaw);
        
        const rollRate = rollRateWorld * cosYaw - pitchRateWorld * sinYaw;
        const pitchRate = rollRateWorld * sinYaw + pitchRateWorld * cosYaw;
        const yawRate = yawRateWorld; 

        
        const hoverThrottle = (this.mass * PHYSICS.GRAVITY) / (4 * DRONE_SPECS.MAX_THRUST_PER_MOTOR);
        const baseThrust = this.throttleInput * DRONE_SPECS.MAX_THRUST_PER_MOTOR;

        
        const rollMix = rollRate * 0.5;
        const pitchMix = pitchRate * 0.5;
        const yawMix = yawRate * 0.5;

        
        
        this.motorTargets[0] = Math.max(0, baseThrust - rollMix + pitchMix - yawMix);
        
        this.motorTargets[1] = Math.max(0, baseThrust + rollMix + pitchMix + yawMix);
        
        this.motorTargets[2] = Math.max(0, baseThrust + rollMix - pitchMix - yawMix);
        
        this.motorTargets[3] = Math.max(0, baseThrust - rollMix - pitchMix + yawMix);

        
        for (let i = 0; i < 4; i++) {
            this.motorTargets[i] = Math.min(this.motorTargets[i], DRONE_SPECS.MAX_THRUST_PER_MOTOR);
        }
    }

    updateMotors(deltaTime) {
        
        const motorTC = PHYSICS.MOTOR_TIME_CONSTANT;
        const alpha = deltaTime / (motorTC + deltaTime);

        for (let i = 0; i < 4; i++) {
            
            this.motorSpeeds[i] += (this.motorTargets[i] - this.motorSpeeds[i]) * alpha;
            
            this.motorThrusts[i] = this.motorSpeeds[i];
            
            const voltageEffect = Math.max(0.6, this.batteryVoltage / DRONE_SPECS.BATTERY_VOLTAGE);
            this.motorThrusts[i] *= voltageEffect;
        }
    }

    updatePhysics(deltaTime) {
        if (deltaTime > 0.033) deltaTime = 0.033; 

        
        this.updateMotors(deltaTime);

        
        const totalThrust = this.motorThrusts.reduce((sum, thrust) => sum + thrust, 0);

        
        const thrustVector = new THREE.Vector3(0, totalThrust, 0);

        
        thrustVector.applyQuaternion(this.mesh.quaternion);

        
        const airspeed = this.velocity.length();
        const dragMagnitude = 0.5 * PHYSICS.AIR_DENSITY * airspeed * airspeed *
                             PHYSICS.DRAG_COEFFICIENT * PHYSICS.PROP_DISC_AREA;
        const dragForce = this.velocity.clone().normalize().multiplyScalar(-dragMagnitude);

        
        if (this.enableWind) {
            this.updateWind(deltaTime);
            const windForce = this.windVelocity.clone().multiplyScalar(0.1);
            thrustVector.add(windForce);
        }

        
        const groundEffect = this.calculateGroundEffect(this.position.y);
        thrustVector.multiplyScalar(groundEffect);

        
        const netForce = new THREE.Vector3();
        netForce.add(thrustVector);
        netForce.add(dragForce);

        
        if (this.enableRealisticGravity) {
            netForce.add(new THREE.Vector3(0, -this.mass * PHYSICS.GRAVITY, 0));
        }

        
        this.acceleration = netForce.divideScalar(this.mass);

        
        this.velocity.addScaledVector(this.acceleration, deltaTime);
        this.position.addScaledVector(this.velocity, deltaTime);

        
        this.updateRotationalDynamics(deltaTime);

        
        this.mesh.position.copy(this.position);

        
        if (this.position.y < 0.5) {
            this.position.y = 0.5;
            this.velocity.y = Math.max(0, this.velocity.y);
            
            this.velocity.x *= 0.9;
            this.velocity.z *= 0.9;
        }

        
        this.totalFlightTime += deltaTime;
        const currentGForce = this.acceleration.length() / PHYSICS.GRAVITY;
        this.maxGForce = Math.max(this.maxGForce, currentGForce);

        
        this.updateBattery(deltaTime);

        
        const dist = this.position.length();
        if (dist > window.simulator.worldMaxDistance) {
            this.position.multiplyScalar(window.simulator.worldMaxDistance / dist);
            this.velocity.multiplyScalar(0.8);
        }

        if (this.position.y > window.simulator.worldMaxAltitude) {
            this.position.y = window.simulator.worldMaxAltitude;
            this.velocity.y = Math.min(this.velocity.y, 0);
        }
    }

    updateRotationalDynamics(deltaTime) {
        
        const armLength = DRONE_SPECS.ARM_LENGTH;

        
        const rollTorque = armLength * (
            (this.motorThrusts[0] + this.motorThrusts[3]) -
            (this.motorThrusts[1] + this.motorThrusts[2])
        );

        
        const pitchTorque = armLength * (
            (this.motorThrusts[0] + this.motorThrusts[1]) -
            (this.motorThrusts[2] + this.motorThrusts[3])
        );

        
        const yawTorque = PHYSICS.GYROSCOPIC_FACTOR * (
            (this.motorThrusts[1] + this.motorThrusts[3]) -
            (this.motorThrusts[0] + this.motorThrusts[2])
        );

        
        const angularAccel = new THREE.Vector3(
            rollTorque / this.inertia.xx,
            yawTorque / this.inertia.zz,
            pitchTorque / this.inertia.yy
        );

        
        if (this.enableGyroscopic) {
            const gyroEffect = this.calculateGyroscopicEffect();
            angularAccel.add(gyroEffect);
        }

        
        this.angularVelocity.addScaledVector(angularAccel, deltaTime);

        
        this.angularVelocity.multiplyScalar(0.95);

        
        if (this.angularVelocity.lengthSq() > 0) {
            const deltaRotation = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(
                    this.angularVelocity.x * deltaTime,
                    this.angularVelocity.y * deltaTime,
                    this.angularVelocity.z * deltaTime,
                    'XYZ'
                )
            );
            this.mesh.quaternion.multiplyQuaternions(deltaRotation, this.mesh.quaternion);
        }
    }

    calculateGyroscopicEffect() {
        
        const motorRPM = this.motorSpeeds.reduce((sum, speed) => sum + speed, 0) / 4;
        const gyroMagnitude = motorRPM * PHYSICS.GYROSCOPIC_FACTOR * 0.001;
        return new THREE.Vector3(
            this.angularVelocity.y * gyroMagnitude,
            -this.angularVelocity.x * gyroMagnitude,
            0
        );
    }

    calculateGroundEffect(height) {
        
        if (height > PHYSICS.GROUND_EFFECT_HEIGHT) return 1.0;
        const ratio = height / PHYSICS.GROUND_EFFECT_HEIGHT;
        return 1.0 + (1.0 - ratio) * 0.15; 
    }

    updateWind(deltaTime) {
        
        this.windTime += deltaTime;
        const turbulence = PHYSICS.WIND_TURBULENCE;
        this.windVelocity.x += (Math.random() - 0.5) * turbulence * deltaTime;
        this.windVelocity.z += (Math.random() - 0.5) * turbulence * deltaTime;
        this.windVelocity.y += (Math.random() - 0.5) * turbulence * 0.2 * deltaTime;

        
        const steadyWind = new THREE.Vector3(
            Math.sin(this.windTime * 0.1) * 1.5,
            Math.sin(this.windTime * 0.07) * 0.3,
            Math.cos(this.windTime * 0.13) * 1.2
        );
        this.windVelocity.lerp(steadyWind, deltaTime * 0.1);
    }

    updateBattery(deltaTime) {
        if (this.battery <= 0) return;

        
        const totalMotorUsage = this.motorThrusts.reduce((sum, thrust) => sum + thrust, 0);
        const drainRate = 0.01 + (totalMotorUsage / (4 * DRONE_SPECS.MAX_THRUST_PER_MOTOR)) * 0.1;
        this.battery = Math.max(0, this.battery - drainRate * deltaTime);
        this.batteryVoltage = DRONE_SPECS.BATTERY_VOLTAGE * (this.battery / 100);
    }

    getGForce() {
        return this.acceleration.length() / PHYSICS.GRAVITY;
    }

    getMotorRPM() {
        const avgRPM = this.motorSpeeds.reduce((sum, speed) => sum + speed, 0) / 4;
        return Math.round(avgRPM * DRONE_SPECS.MOTOR_KV);
    }

    getStatus() {
        if (!this.armed) return 'DISARMED';
        if (this.battery <= 0) return 'BATTERY EMPTY';
        if (this.position.y < 1.0) return 'LANDED';
        return 'FLYING';
    }

    isGrounded() {
        return this.position.y < 1.0 && this.velocity.length() < 0.5;
    }
}

class RealisticGateManager {
    constructor(scene) {
        this.scene = scene;
        this.gates = [];
        this.passedCount = 0;
        this.totalGates = 0;
        this.nextGateId = 1;
        this.gateSpacing = 35;
        this.maxDistance = 500; 
        console.log('[GATES] Realistic Gate Manager initialized');
    }

    buildCourse(gateCount = 10, difficulty = 'intermediate') {
        this.clearCourse();
        this.totalGates = gateCount;
        this.nextGateId = 1;

        const configs = {
            easy: { spacing: 40, height: [5, 12], spread: 20 },
            intermediate: { spacing: 35, height: [3, 18], spread: 35 },
            hard: { spacing: 30, height: [2, 25], spread: 50 }
        };

        const config = configs[difficulty] || configs.intermediate;
        this.gateSpacing = config.spacing;

        for (let i = 1; i <= gateCount; i++) {
            const gate = this.createRealisticGate(i, config);
            this.scene.add(gate);
            this.gates.push(gate);
        }

        console.log(`[GATES] Built ${difficulty} course with ${gateCount} gates`);
    }

    createRealisticGate(index, config) {
        
        const frameGeometry = new THREE.TorusGeometry(3, 0.2, 8, 16);
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0x002200
        });
        const gate = new THREE.Mesh(frameGeometry, frameMaterial);

        
        let posX, posZ;
        if (index <= 8) {
            
            posX = THREE.MathUtils.randFloatSpread(config.spread);
            posZ = -index * config.spacing;
        } else {
            
            const turnGate = index - 8;
            const turnDirection = (Math.floor(turnGate / 4) % 2) ? -1 : 1; 
            const baseDistance = 8 * config.spacing;
            
            if (turnGate % 4 === 1) {
                
                posX = turnDirection * 50;
                posZ = -baseDistance - (Math.floor(turnGate / 4) * 100);
            } else {
                
                posX = turnDirection * 50 + THREE.MathUtils.randFloatSpread(20);
                posZ = -baseDistance - (Math.floor(turnGate / 4) * 100) - ((turnGate % 4) - 1) * 30;
            }
        }

        gate.position.set(
            posX,
            THREE.MathUtils.randFloat(config.height[0], config.height[1]),
            posZ
        );

        
        gate.rotation.x = THREE.MathUtils.randFloat(-0.3, 0.3);
        gate.rotation.y = THREE.MathUtils.randFloat(-0.5, 0.5);
        gate.rotation.z = THREE.MathUtils.randFloat(-0.2, 0.2);

        
        const ledGeometry = new THREE.TorusGeometry(3.2, 0.05, 4, 32);
        const ledMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.8
        });
        const ledRing = new THREE.Mesh(ledGeometry, ledMaterial);
        gate.add(ledRing);

        
        gate.userData = { index: index, passed: false };
        return gate;
    }

    checkGatePass(drone, onPass) {
        this.gates.forEach(gate => {
            if (gate.userData.passed) return;

            const distance = gate.position.distanceTo(drone.position);
            if (distance < 3.5) {
                
                const gateNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(gate.quaternion);
                const droneDirection = drone.velocity.clone().normalize();
                const dotProduct = droneDirection.dot(gateNormal);

                if (Math.abs(dotProduct) > 0.3) { 
                    gate.userData.passed = true;
                    this.passedCount++;

                    
                    gate.material.color.setHex(0x00ff00);
                    gate.material.emissive.setHex(0x004400);

                    onPass(gate.userData.index);
                    console.log(`[GATES] Gate ${gate.userData.index} passed! (${this.passedCount}/${this.totalGates})`);

                    
                    this.addDynamicGate();
                }
            }
        });
    }

    addDynamicGate() {
        const idx = this.totalGates + 1;
        this.totalGates++;
        const config = { spacing: 35, height: [3, 18], spread: 35 };
        const newGate = this.createRealisticGate(idx, config);
        this.scene.add(newGate);
        this.gates.push(newGate);
        console.log(`[GATES] Dynamic gate ${idx} added`);
    }

    clearCourse() {
        this.gates.forEach(gate => this.scene.remove(gate));
        this.gates = [];
        this.passedCount = 0;
        this.nextGateId = 1;
    }

    getRemainingGates() {
        return this.totalGates - this.passedCount;
    }

    getPassedCount() {
        return this.passedCount;
    }

    getTotalGates() {
        return this.totalGates;
    }
}

class RealisticEnvironment {
    constructor(scene) {
        this.scene = scene;
        this.environmentObjects = [];
        this.grassSegments = new Map();
        this.treeObjects = new Map();
        this.buildingObjects = new Map();
        this.segmentSize = 200;
        this.loadRadius = 6; 
        this.fogDistance = 800; 
        
        console.log('[ENV] Creating true endless grass field environment...');
        
        
        this.createAtmosphere();
        this.createMainGroundPlane();
        
        console.log('[ENV] True endless grass field environment created');
    }

    
    createMainGroundPlane() {
        console.log('[ENV] Creating main endless ground plane...');
        
        const groundSize = 4000; 
        const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize, 4, 4);
        
        const groundMaterial = new THREE.MeshLambertMaterial({
            color: 0x4a7c59, 
            side: THREE.DoubleSide,
            transparent: false,
            opacity: 1.0
        });
        
        const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
        groundPlane.rotation.x = -Math.PI / 2;
        groundPlane.position.set(0, -0.1, 0); 
        groundPlane.receiveShadow = true;
        groundPlane.name = 'MainGroundPlane';
        
        this.scene.add(groundPlane);
        this.environmentObjects.push(groundPlane);
        
        console.log('[ENV] Main endless ground plane created');
    }

    
    updateGrassField(dronePosition) {
        const droneX = Math.floor(dronePosition.x / this.segmentSize);
        const droneZ = Math.floor(dronePosition.z / this.segmentSize);

        
        for (let x = droneX - this.loadRadius; x <= droneX + this.loadRadius; x++) {
            for (let z = droneZ - this.loadRadius; z <= droneZ + this.loadRadius; z++) {
                const key = `${x},${z}`;
                if (!this.grassSegments.has(key)) {
                    this.createGrassSegment(x, z);
                    this.grassSegments.set(key, true);
                    
                    
                    if (Math.random() < 0.3) { 
                        this.createTreesInSegment(x, z);
                    }
                    if (Math.random() < 0.1) { 
                        this.createBuildingInSegment(x, z);
                    }
                }
            }
        }

        
        for (const [key] of this.grassSegments) {
            const [segX, segZ] = key.split(',').map(Number);
            const distance = Math.max(Math.abs(segX - droneX), Math.abs(segZ - droneZ));
            if (distance > this.loadRadius + 2) {
                this.removeGrassSegment(segX, segZ);
                this.grassSegments.delete(key);
                this.removeTreesInSegment(segX, segZ);
                this.removeBuildingInSegment(segX, segZ);
            }
        }
    }

    createGrassSegment(segX, segZ) {
        const posX = segX * this.segmentSize;
        const posZ = segZ * this.segmentSize;

        
        const segmentGeometry = new THREE.PlaneGeometry(
            this.segmentSize, this.segmentSize, 15, 15
        );

        
        const vertices = segmentGeometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            const worldX = posX + vertices[i];
            const worldZ = posZ + vertices[i + 2];
            vertices[i + 1] = this.getGrassHeight(worldX, worldZ);
        }

        segmentGeometry.attributes.position.needsUpdate = true;
        segmentGeometry.computeVertexNormals();

        
        const grassColor = this.getGrassColor(posX, posZ);
        const segmentMaterial = new THREE.MeshLambertMaterial({
            color: grassColor,
            transparent: false,
            opacity: 1.0
        });

        const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
        segment.rotation.x = -Math.PI / 2;
        segment.position.set(posX, 0, posZ);
        segment.receiveShadow = true;
        segment.name = `grass_${segX}_${segZ}`;

        this.scene.add(segment);
        this.environmentObjects.push(segment);

        
        this.createGrassObjectsInSegment(segX, segZ);
    }

    createGrassObjectsInSegment(segX, segZ) {
        const posX = segX * this.segmentSize;
        const posZ = segZ * this.segmentSize;
        const grassCount = 20; 

        for (let i = 0; i < grassCount; i++) {
            const x = posX + (Math.random() - 0.5) * this.segmentSize;
            const z = posZ + (Math.random() - 0.5) * this.segmentSize;
            this.createGrassObject(x, z);
        }
    }

    createGrassObject(x, z) {
        const grassGeometry = new THREE.ConeGeometry(
            THREE.MathUtils.randFloat(0.05, 0.15),
            THREE.MathUtils.randFloat(0.3, 1.2),
            6
        );

        const hue = 0.25 + (Math.random() - 0.5) * 0.1;
        const sat = 0.6 + Math.random() * 0.3;
        const lit = 0.3 + Math.random() * 0.3;
        
        const grassMaterial = new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(hue, sat, lit)
        });

        const grass = new THREE.Mesh(grassGeometry, grassMaterial);
        const terrainHeight = this.getGrassHeight(x, z);
        grass.position.set(x, terrainHeight + 0.1, z);
        grass.rotation.y = Math.random() * Math.PI * 2;
        grass.rotation.z = (Math.random() - 0.5) * 0.4;
        grass.castShadow = true;
        grass.receiveShadow = true;

        this.scene.add(grass);
        this.environmentObjects.push(grass);
    }

    createTreesInSegment(segX, segZ) {
        const key = `${segX},${segZ}`;
        const trees = [];
        const treeCount = Math.floor(Math.random() * 5) + 2; 

        for (let i = 0; i < treeCount; i++) {
            const tree = this.createTree(segX, segZ);
            if (tree) {
                this.scene.add(tree);
                trees.push(tree);
                this.environmentObjects.push(tree);
            }
        }

        this.treeObjects.set(key, trees);
    }

    createTree(segX, segZ) {
        const posX = segX * this.segmentSize + (Math.random() - 0.5) * this.segmentSize * 0.8;
        const posZ = segZ * this.segmentSize + (Math.random() - 0.5) * this.segmentSize * 0.8;

        const treeGroup = new THREE.Group();

        
        const trunkGeometry = new THREE.CylinderGeometry(0.4, 0.6, 8, 8);
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 4;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        
        const leavesGeometry = new THREE.SphereGeometry(5, 12, 8);
        const leavesMaterial = new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(0.25 + Math.random() * 0.1, 0.8, 0.4)
        });
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.y = 10;
        leaves.castShadow = true;
        treeGroup.add(leaves);

        treeGroup.position.set(posX, this.getGrassHeight(posX, posZ), posZ);
        return treeGroup;
    }

    createBuildingInSegment(segX, segZ) {
        const key = `${segX},${segZ}`;
        const building = this.createBuilding(segX, segZ);
        
        if (building) {
            this.scene.add(building);
            this.environmentObjects.push(building);
            this.buildingObjects.set(key, building);
        }
    }

    createBuilding(segX, segZ) {
        const posX = segX * this.segmentSize + (Math.random() - 0.5) * this.segmentSize * 0.6;
        const posZ = segZ * this.segmentSize + (Math.random() - 0.5) * this.segmentSize * 0.6;

        const height = THREE.MathUtils.randFloat(8, 20);
        const width = THREE.MathUtils.randFloat(10, 25);
        const depth = THREE.MathUtils.randFloat(10, 20);

        const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
        const buildingMaterial = new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(0, 0, THREE.MathUtils.randFloat(0.5, 0.9))
        });

        const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        building.position.set(posX, height / 2, posZ);
        building.castShadow = true;
        building.receiveShadow = true;

        return building;
    }

    removeGrassSegment(segX, segZ) {
        const segmentName = `grass_${segX}_${segZ}`;
        const segment = this.scene.getObjectByName(segmentName);
        if (segment) {
            this.scene.remove(segment);
            segment.geometry.dispose();
            segment.material.dispose();
            const index = this.environmentObjects.indexOf(segment);
            if (index > -1) {
                this.environmentObjects.splice(index, 1);
            }
        }
    }

    removeTreesInSegment(segX, segZ) {
        const key = `${segX},${segZ}`;
        const trees = this.treeObjects.get(key);
        if (trees) {
            trees.forEach(tree => {
                this.scene.remove(tree);
                const index = this.environmentObjects.indexOf(tree);
                if (index > -1) {
                    this.environmentObjects.splice(index, 1);
                }
            });
            this.treeObjects.delete(key);
        }
    }

    removeBuildingInSegment(segX, segZ) {
        const key = `${segX},${segZ}`;
        const building = this.buildingObjects.get(key);
        if (building) {
            this.scene.remove(building);
            const index = this.environmentObjects.indexOf(building);
            if (index > -1) {
                this.environmentObjects.splice(index, 1);
            }
            this.buildingObjects.delete(key);
        }
    }

    
    getGrassHeight(x, z) {
        const scale1 = 0.01;
        const scale2 = 0.03;
        const scale3 = 0.08;
        const h1 = Math.sin(x * scale1) * Math.cos(z * scale1) * 1.0;
        const h2 = Math.sin(x * scale2) * Math.cos(z * scale2) * 0.5;
        const h3 = Math.sin(x * scale3) * Math.cos(z * scale3) * 0.2;
        return (h1 + h2 + h3) * 0.8; 
    }

    
    getGrassColor(x, z) {
        const baseHue = 0.25 + Math.sin(x * 0.01) * Math.cos(z * 0.01) * 0.05;
        const baseSat = 0.7 + Math.sin(x * 0.015) * 0.1;
        const baseLit = 0.4 + Math.cos(x * 0.012) * Math.sin(z * 0.012) * 0.15;

        const hue = Math.max(0.2, Math.min(0.35, baseHue));
        const sat = Math.max(0.5, Math.min(0.9, baseSat));
        const lit = Math.max(0.25, Math.min(0.55, baseLit));
        
        return new THREE.Color().setHSL(hue, sat, lit);
    }

    createAtmosphere() {
        
        const skyGeometry = new THREE.SphereGeometry(2000, 32, 16);
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x5599ff) },
                bottomColor: { value: new THREE.Color(0x87ceeb) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide
        });

        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        sky.name = 'sky';
        this.scene.add(sky);
        this.environmentObjects.push(sky);

        
        this.createClouds();
    }

    createClouds() {
        const cloudCount = 20; 
        for (let i = 0; i < cloudCount; i++) {
            const cloudGeometry = new THREE.SphereGeometry(
                THREE.MathUtils.randFloat(15, 40), 16, 12
            );
            const cloudMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: THREE.MathUtils.randFloat(0.6, 0.9),
                fog: false
            });

            const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
            cloud.position.set(
                THREE.MathUtils.randFloatSpread(1500),
                THREE.MathUtils.randFloat(60, 150),
                THREE.MathUtils.randFloatSpread(1500)
            );

            this.scene.add(cloud);
            this.environmentObjects.push(cloud);
        }
    }

    
    update(dronePosition) {
        this.updateGrassField(dronePosition);
        
        
        if (window.simulator && window.simulator.scene) {
            window.simulator.scene.fog.far = this.fogDistance;
            window.simulator.scene.fog.near = this.fogDistance * 0.6;
        }
    }

    
    regenerateWorld() {
        console.log('[ENV] Regenerating endless grass field world...');

        
        this.environmentObjects.forEach(obj => {
            if (obj.name !== 'sky' && obj.name !== 'MainGroundPlane') {
                this.scene.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(mat => mat.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            }
        });

        this.environmentObjects = this.environmentObjects.filter(obj => 
            obj.name === 'sky' || obj.name === 'MainGroundPlane'
        );
        
        
        this.grassSegments.clear();
        this.treeObjects.clear();
        this.buildingObjects.clear();

        console.log('[ENV] Endless grass field world regenerated successfully');
    }
}

class AcrobaticTrainer {
    constructor() {
        this.challenges = [
            {
                name: "Power Loop",
                description: "Complete a full forward loop",
                target: { pitch: 6.28, minSpeed: 5 }, 
                completed: false,
                points: 100
            },
            {
                name: "Barrel Roll",
                description: "Complete a full roll maneuver",
                target: { roll: 6.28, minSpeed: 3 },
                completed: false,
                points: 75
            },
            {
                name: "Split-S",
                description: "Half roll followed by half loop",
                target: { combo: true, roll: 3.14, pitch: -3.14 },
                completed: false,
                points: 150
            },
            {
                name: "Inverted Flight",
                description: "Maintain inverted flight for 3 seconds",
                target: { inverted: 3.0 },
                completed: false,
                points: 125,
                timer: 0
            },
            {
                name: "High G Turn",
                description: "Pull 4G in a turn",
                target: { gforce: 4.0 },
                completed: false,
                points: 100
            }
        ];

        this.totalRotation = { pitch: 0, roll: 0, yaw: 0 };
        this.lastRotation = { pitch: 0, roll: 0, yaw: 0 };
        this.comboState = { splitS: false };
        this.reset();
    }

    reset() {
        this.challenges.forEach(challenge => {
            challenge.completed = false;
            challenge.timer = 0;
        });
        this.totalRotation = { pitch: 0, roll: 0, yaw: 0 };
        this.lastRotation = { pitch: 0, roll: 0, yaw: 0 };
        this.comboState = { splitS: false };
    }

    update(drone, deltaTime) {
        
        const currentRotation = {
            pitch: drone.mesh.rotation.x,
            roll: drone.mesh.rotation.z,
            yaw: drone.mesh.rotation.y
        };

        
        const deltaPitch = currentRotation.pitch - this.lastRotation.pitch;
        const deltaRoll = currentRotation.roll - this.lastRotation.roll;
        const deltaYaw = currentRotation.yaw - this.lastRotation.yaw;

        
        this.totalRotation.pitch += Math.abs(deltaPitch);
        this.totalRotation.roll += Math.abs(deltaRoll);
        this.totalRotation.yaw += Math.abs(deltaYaw);

        this.lastRotation = { ...currentRotation };

        
        this.challenges.forEach(challenge => {
            if (challenge.completed) return;

            switch (challenge.name) {
                case "Power Loop":
                    if (this.totalRotation.pitch >= challenge.target.pitch &&
                        drone.velocity.length() >= challenge.target.minSpeed) {
                        challenge.completed = true;
                        this.onChallengeComplete(challenge);
                    }
                    break;

                case "Barrel Roll":
                    if (this.totalRotation.roll >= challenge.target.roll &&
                        drone.velocity.length() >= challenge.target.minSpeed) {
                        challenge.completed = true;
                        this.onChallengeComplete(challenge);
                    }
                    break;

                case "Inverted Flight":
                    const isInverted = Math.abs(currentRotation.roll % (2 * Math.PI) - Math.PI) < 0.5;
                    if (isInverted && drone.velocity.length() > 2) {
                        challenge.timer += deltaTime;
                        if (challenge.timer >= challenge.target.inverted) {
                            challenge.completed = true;
                            this.onChallengeComplete(challenge);
                        }
                    } else {
                        challenge.timer = 0;
                    }
                    break;

                case "High G Turn":
                    if (drone.getGForce() >= challenge.target.gforce) {
                        challenge.completed = true;
                        this.onChallengeComplete(challenge);
                    }
                    break;
            }
        });

        return this.getProgress();
    }

    onChallengeComplete(challenge) {
        console.log(`[ACRO] Challenge completed: ${challenge.name} (+${challenge.points} points)`);
        
        window.simulator.showMessage(`${challenge.name} Complete! +${challenge.points}pts`, '#4CAF50');
        window.simulator.score += challenge.points;
    }

    getProgress() {
        const completed = this.challenges.filter(c => c.completed).length;
        const total = this.challenges.length;
        return { completed, total, challenges: this.challenges };
    }

    getCurrentChallenge() {
        return this.challenges.find(c => !c.completed) || null;
    }

    isComplete() {
        return this.challenges.every(c => c.completed);
    }
}

class RealisticDroneSimulator {
    constructor() {
        console.log('[SIM] Initializing Complete Enhanced Realistic Drone Simulator...');
        this.input = new RealisticInputManager();
        this.setupThreeJS();
        this.setupRealisticScene();
        this.setupUI();

        
        this.currentMode = 'menu';
        this.lastGameMode = null;
        this.cameraMode = 'fpv';
        this.isPaused = true;
        this.score = 0;
        this.startTime = 0;
        this.debugEnabled = false;

        
        this.worldMaxDistance = 1500; 
        this.worldMaxAltitude = 300; 

        
        this.fov = 90;
        this.motionBlur = true;
        this.cameraOffset = new THREE.Vector3(0, 0.1, 0.3);

        
        this.acroTrainer = new AcrobaticTrainer();
        this.countdownActive = false;

        
        this.flightStats = {
            maxSpeed: 0,
            avgSpeed: 0,
            totalDistance: 0,
            smoothness: 0,
            lastPosition: new THREE.Vector3()
        };

        
        this.simulateLoading();
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.gameLoop(time));
        
        console.log('[SIM] Complete Enhanced Realistic Drone Simulator initialized successfully');
    }

    simulateLoading() {
        const loadingSteps = [
            'Initializing complete physics engine...',
            'Loading fixed controller mapping...',
            'Setting up true endless world generation...',
            'Creating infinite grass field terrain...',
            'Preparing enhanced acrobatic training...',
            'Optimizing fog and rendering system...',
            'Loading complete environment objects...',
            'Initializing world boundary system...',
            'Ready for complete flight experience!'
        ];

        let currentStep = 0;
        const progressBar = id('loadingProgress');
        const loadingText = id('loadingText');

        const updateLoading = () => {
            if (currentStep < loadingSteps.length) {
                progressBar.style.width = `${(currentStep / loadingSteps.length) * 100}%`;
                loadingText.textContent = loadingSteps[currentStep];
                currentStep++;
                setTimeout(updateLoading, 600);
            } else {
                setTimeout(() => {
                    id('loadingScreen').classList.add('hidden');
                    this.showScreen('main');
                }, 500);
            }
        };
        updateLoading();
    }

    setupThreeJS() {
        
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x87ceeb, 200, 800); 

        
        this.camera = new THREE.PerspectiveCamera(
            this.fov,
            window.innerWidth / window.innerHeight,
            0.1,
            2000 
        );

        
        this.renderer = new THREE.WebGLRenderer({
            canvas: id('gameCanvas'),
            antialias: true,
            powerPreference: 'high-performance'
        });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.3;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        console.log('[SIM] Enhanced Three.js setup complete');
    }

    setupRealisticScene() {
        
        const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x6b8e23, 1.2);
        this.scene.add(hemisphereLight);

        
        this.sunlight = new THREE.DirectionalLight(0xffffff, 2.5);
        this.sunlight.position.set(200, 200, 100);
        this.sunlight.castShadow = true;
        this.sunlight.shadow.mapSize.width = 4096;
        this.sunlight.shadow.mapSize.height = 4096;
        this.sunlight.shadow.camera.near = 1;
        this.sunlight.shadow.camera.far = 1000;
        this.sunlight.shadow.camera.left = -500;
        this.sunlight.shadow.camera.right = 500;
        this.sunlight.shadow.camera.top = 500;
        this.sunlight.shadow.camera.bottom = -500;
        this.sunlight.shadow.bias = -0.0001;
        this.scene.add(this.sunlight);

        
        this.createRealisticDroneModel();

        
        this.environment = new RealisticEnvironment(this.scene);
        this.gates = new RealisticGateManager(this.scene);

        console.log('[SIM] Complete realistic grass field scene setup complete');
    }

    
    createRealisticDroneModel() {
        const droneGroup = new THREE.Group();

        
        const bodyGeometry = new THREE.BoxGeometry(0.8, 0.12, 0.8);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            metalness: 0.3,
            roughness: 0.7
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        droneGroup.add(body);

        
        const topPlateGeometry = new THREE.BoxGeometry(0.6, 0.02, 0.6);
        const topPlateMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            metalness: 0.8,
            roughness: 0.2
        });
        const topPlate = new THREE.Mesh(topPlateGeometry, topPlateMaterial);
        topPlate.position.y = 0.07;
        topPlate.castShadow = true;
        droneGroup.add(topPlate);

        
        const armGeometry = new THREE.CylinderGeometry(0.015, 0.015, 0.3, 8);
        const armMaterial = new THREE.MeshStandardMaterial({
            color: 0x0a0a0a,
            metalness: 0.1,
            roughness: 0.9
        });

        
        for (let i = 0; i < 4; i++) {
            const arm = new THREE.Mesh(armGeometry, armMaterial);
            const angle = (i * Math.PI) / 2 + Math.PI / 4;
            arm.position.set(Math.cos(angle) * 0.25, 0, Math.sin(angle) * 0.25);
            arm.rotation.z = angle + Math.PI / 2;
            arm.castShadow = true;
            droneGroup.add(arm);

            
            const motorMountGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.04, 12);
            const motorMountMaterial = new THREE.MeshStandardMaterial({
                color: 0x333333,
                metalness: 0.9,
                roughness: 0.1
            });
            const motorMount = new THREE.Mesh(motorMountGeometry, motorMountMaterial);
            motorMount.position.set(Math.cos(angle) * 0.4, 0.02, Math.sin(angle) * 0.4);
            motorMount.castShadow = true;
            droneGroup.add(motorMount);

            
            const motorGeometry = new THREE.CylinderGeometry(0.04, 0.035, 0.06, 16);
            const motorMaterial = new THREE.MeshStandardMaterial({
                color: 0x444444,
                metalness: 0.9,
                roughness: 0.1
            });
            const motor = new THREE.Mesh(motorGeometry, motorMaterial);
            motor.position.set(Math.cos(angle) * 0.4, 0.06, Math.sin(angle) * 0.4);
            motor.castShadow = true;
            droneGroup.add(motor);

            
            const propGroup = new THREE.Group();
            
            
            const hubGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.006, 8);
            const hubMaterial = new THREE.MeshStandardMaterial({
                color: 0x666666,
                metalness: 0.7,
                roughness: 0.3
            });
            const hub = new THREE.Mesh(hubGeometry, hubMaterial);
            propGroup.add(hub);

            
            const bladeGeometry = new THREE.BoxGeometry(0.002, 0.001, 0.12);
            const bladeMaterial = new THREE.MeshStandardMaterial({
                color: 0x555555,
                transparent: true,
                opacity: 0.8
            });

            for (let b = 0; b < 2; b++) {
                const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
                blade.rotation.y = b * Math.PI;
                blade.position.z = 0.03;
                propGroup.add(blade);
            }

            propGroup.position.set(Math.cos(angle) * 0.4, 0.095, Math.sin(angle) * 0.4);
            droneGroup.add(propGroup);
        }

        
        const gimbalGroup = new THREE.Group();
        
        
        const gimbalMountGeometry = new THREE.BoxGeometry(0.04, 0.02, 0.03);
        const gimbalMountMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.8,
            roughness: 0.2
        });
        const gimbalMount = new THREE.Mesh(gimbalMountGeometry, gimbalMountMaterial);
        gimbalGroup.add(gimbalMount);

        
        const cameraGeometry = new THREE.BoxGeometry(0.025, 0.015, 0.03);
        const cameraMaterial = new THREE.MeshStandardMaterial({
            color: 0x000000,
            metalness: 0.8,
            roughness: 0.2
        });
        const camera = new THREE.Mesh(cameraGeometry, cameraMaterial);
        camera.position.z = 0.02;
        gimbalGroup.add(camera);

        
        const lensGeometry = new THREE.CylinderGeometry(0.006, 0.006, 0.008, 12);
        const lensMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.9,
            roughness: 0.1
        });
        const lens = new THREE.Mesh(lensGeometry, lensMaterial);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 0, 0.035);
        gimbalGroup.add(lens);

        gimbalGroup.position.set(0, -0.04, 0.35);
        gimbalGroup.rotation.x = -0.2; 
        droneGroup.add(gimbalGroup);

        
        const batteryGeometry = new THREE.BoxGeometry(0.3, 0.08, 0.15);
        const batteryMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            metalness: 0.2,
            roughness: 0.8
        });
        const battery = new THREE.Mesh(batteryGeometry, batteryMaterial);
        battery.position.set(0, -0.08, 0);
        battery.castShadow = true;
        droneGroup.add(battery);

        
        const antennaGeometry = new THREE.CylinderGeometry(0.001, 0.001, 0.08, 4);
        const antennaMaterial = new THREE.MeshStandardMaterial({
            color: 0x666666,
            metalness: 0.8,
            roughness: 0.2
        });

        
        const vtxAntenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
        vtxAntenna.position.set(0.3, 0.08, -0.3);
        vtxAntenna.rotation.z = 0.2;
        droneGroup.add(vtxAntenna);

        
        const rxAntenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
        rxAntenna.position.set(-0.3, 0.08, -0.3);
        rxAntenna.rotation.z = -0.2;
        droneGroup.add(rxAntenna);

        
        const ledGeometry = new THREE.BoxGeometry(0.02, 0.002, 0.1);
        
        
        const frontLEDMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8
        });
        const frontLEDs = new THREE.Mesh(ledGeometry, frontLEDMaterial);
        frontLEDs.position.set(0, 0.08, 0.35);
        droneGroup.add(frontLEDs);

        
        const backLEDMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.8
        });
        const backLEDs = new THREE.Mesh(ledGeometry, backLEDMaterial);
        backLEDs.position.set(0, 0.08, -0.35);
        droneGroup.add(backLEDs);

        droneGroup.position.set(0, 2, 0);
        this.scene.add(droneGroup);

        
        this.drone = new RealisticDrone(droneGroup);

        console.log('[SIM] Ultra-realistic drone model created');
    }

    setupUI() {
        
        id('btnFreefly').addEventListener('click', () => this.startFreefly());
        id('btnGate').addEventListener('click', () => this.startGateRacing());
        id('btnAcrobatic').addEventListener('click', () => this.startAcrobatic());
        id('btnSettings').addEventListener('click', () => this.showScreen('settings'));

        
        id('btnResetWorld').addEventListener('click', () => this.resetWorld());

        
        id('btnBackToMain').addEventListener('click', () => this.showScreen('main'));

        
        this.setupSettingsControls();

        
        id('btnPlayAgain').addEventListener('click', () => this.startGateRacing());
        id('btnMainMenu').addEventListener('click', () => this.showScreen('main'));

        
        id('gameMenuBtn').addEventListener('click', () => this.toggleMenu());

        console.log('[SIM] Complete UI setup complete');
    }

    
    resetWorld() {
        console.log('[SIM] Resetting complete endless grass field world...');

        
        this.gates.clearCourse();

        
        this.environment.regenerateWorld();

        
        this.drone.position.set(0, 2, 0);
        this.drone.velocity.set(0, 0, 0);
        this.drone.angularVelocity.set(0, 0, 0);
        this.drone.mesh.position.set(0, 2, 0);
        this.drone.mesh.quaternion.set(0, 0, 0, 1);
        this.drone.armed = false;

        
        this.acroTrainer.reset();

        
        this.showMessage('Complete endless grass field regenerated!', '#4CAF50');
        console.log('[SIM] Complete endless grass field world reset complete');
    }

    setupSettingsControls() {
        
        this.setupSlider('drone-weight-slider', 'drone-weight-value', (value) => {
            this.drone.setMass(parseFloat(value));
            id('drone-weight-value').textContent = value + 'kg';
        });

        this.setupSlider('twr-slider', 'twr-value', (value) => {
            DRONE_SPECS.THRUST_TO_WEIGHT = parseFloat(value);
            DRONE_SPECS.MAX_THRUST_PER_MOTOR = this.drone.mass * PHYSICS.GRAVITY * parseFloat(value) / 4;
            id('twr-value').textContent = value + ':1';
        });

        this.setupSlider('motor-response-slider', 'motor-response-value', (value) => {
            PHYSICS.MOTOR_TIME_CONSTANT = parseFloat(value) / 1000;
            id('motor-response-value').textContent = value + 'ms';
        });

        
        id('realistic-gravity-check').addEventListener('change', (e) => {
            this.drone.enableRealisticGravity = e.target.checked;
        });

        id('wind-effects-check').addEventListener('change', (e) => {
            this.drone.enableWind = e.target.checked;
        });

        id('prop-wash-check').addEventListener('change', (e) => {
            this.drone.enablePropWash = e.target.checked;
        });

        id('gyroscopic-check').addEventListener('change', (e) => {
            this.drone.enableGyroscopic = e.target.checked;
        });

        this.setupSlider('air-density-slider', 'air-density-value', (value) => {
            PHYSICS.AIR_DENSITY = parseFloat(value);
            id('air-density-value').textContent = value + ' kg/m³';
        });

        
        id('skill-level').addEventListener('change', (e) => {
            const level = e.target.value;
            if (level !== 'custom') {
                this.input.setRates(RATES[level.toUpperCase()]);
                this.updateRateSliders();
            }
        });

        this.setupSlider('max-rate-slider', 'max-rate-value', (value) => {
            this.input.rates.max = parseInt(value);
            id('max-rate-value').textContent = value + '°/s';
        });

        this.setupSlider('center-sens-slider', 'center-sens-value', (value) => {
            this.input.rates.center = parseInt(value);
            id('center-sens-value').textContent = value + '°/s';
        });

        this.setupSlider('expo-slider', 'expo-value', (value) => {
            this.input.expo = parseFloat(value);
            id('expo-value').textContent = value;
        });

        
        id('cameraMode').addEventListener('change', (e) => {
            this.cameraMode = e.target.value;
        });

        this.setupSlider('fov-slider', 'fov-value', (value) => {
            this.fov = parseInt(value);
            this.camera.fov = this.fov;
            this.camera.updateProjectionMatrix();
            id('fov-value').textContent = value + '°';
        });

        id('motion-blur-check').addEventListener('change', (e) => {
            this.motionBlur = e.target.checked;
        });

        
        id('btnCal').addEventListener('click', () => this.calibrateControllers());

        
        this.setupSlider('max-distance-slider', 'max-distance-value', (v) => {
            this.worldMaxDistance = parseInt(v);
            id('max-distance-value').textContent = v + ' m';
        });

        this.setupSlider('max-altitude-slider', 'max-altitude-value', (v) => {
            this.worldMaxAltitude = parseInt(v);
            id('max-altitude-value').textContent = v + ' m';
        });

        
        id('unlimited-battery-check').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.drone.battery = 100;
            }
        });

        id('show-debug-check').addEventListener('change', (e) => {
            this.debugEnabled = e.target.checked;
            id('debugPanel').classList.toggle('hidden', !this.debugEnabled);
        });

        id('toggle-debug-btn').addEventListener('click', () => this.toggleDebug());
    }

    setupSlider(sliderId, valueId, callback) {
        const slider = id(sliderId);
        const valueDisplay = id(valueId);
        if (slider && valueDisplay) {
            slider.addEventListener('input', () => {
                callback(slider.value);
            });
        }
    }

    updateRateSliders() {
        id('max-rate-slider').value = this.input.rates.max;
        id('max-rate-value').textContent = this.input.rates.max + '°/s';
        id('center-sens-slider').value = this.input.rates.center;
        id('center-sens-value').textContent = this.input.rates.center + '°/s';
    }

    calibrateControllers() {
        const success = this.input.calibrate();
        this.showMessage(
            success ? 'Controllers calibrated successfully!' : 'No gamepad detected.',
            success ? '#4CAF50' : '#f44336'
        );
    }

    showMessage(text, color) {
        const msg = document.createElement('div');
        msg.textContent = text;
        msg.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: ${color}; color: white; padding: 15px 30px;
            border-radius: 5px; z-index: 10000; font-weight: bold;
        `;
        document.body.appendChild(msg);
        setTimeout(() => document.body.removeChild(msg), 2000);
    }

    showScreen(screenName) {
        qsa('.screen').forEach(screen => screen.classList.add('hidden'));
        
        switch (screenName) {
            case 'main':
                id('mainMenu').classList.remove('hidden');
                this.currentMode = 'menu';
                this.isPaused = true;
                break;
            case 'settings':
                id('settingsMenu').classList.remove('hidden');
                this.currentMode = 'settings';
                this.isPaused = true;
                
                break;
            case 'game':
                id('gameScreen').classList.remove('hidden');
                this.isPaused = false;
                break;
            case 'mission':
                id('missionComplete').classList.remove('hidden');
                this.currentMode = 'mission';
                this.isPaused = true;
                break;
        }

        console.log(`[SIM] Switched to screen: ${screenName}`);
    }

    toggleMenu() {
        if (this.currentMode === 'game' || this.currentMode === 'free' ||
            this.currentMode === 'gate' || this.currentMode === 'acrobatic') {
            this.showScreen('main');
        } else if (this.currentMode === 'menu' && this.lastGameMode) {
            this.showScreen('game');
            this.currentMode = this.lastGameMode;
            this.isPaused = false;
        }
    }

    toggleDebug() {
        this.debugEnabled = !this.debugEnabled;
        id('debugPanel').classList.toggle('hidden', !this.debugEnabled);
        id('show-debug-check').checked = this.debugEnabled;
    }

    startFreefly() {
        this.currentMode = 'free';
        this.lastGameMode = 'free';
        this.resetFlightStats();
        this.resetWorld(); 
        id('objective').textContent = 'Explore the endless grass field with authentic flight physics!';
        id('flightMode').textContent = 'Free Flight';
        this.showScreen('game');
        console.log('[SIM] Started Complete Endless Grass Field Free Flight mode');
    }

    startGateRacing() {
        this.currentMode = 'gate';
        this.lastGameMode = 'gate';
        this.resetFlightStats();
        this.resetWorld(); 
        this.gates.buildCourse(8, 'intermediate');
        id('objective').textContent = 'Navigate through gates! New gates appear as you progress!';
        id('flightMode').textContent = 'Gate Racing';
        this.showScreen('game');

        
        this.startCountdown();
        console.log('[SIM] Started Complete Gate Racing mode with countdown');
    }

    startCountdown() {
        this.countdownActive = true;
        this.isPaused = true;
        
        const countdownOverlay = id('countdown') || (() => {
            const d = document.createElement('div');
            d.id = 'countdown';
            d.style.cssText = `
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                font-size: 96px; color: white; z-index: 9999; font-weight: bold;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            `;
            document.body.appendChild(d);
            return d;
        })();

        let t = 3;
        countdownOverlay.textContent = t;
        
        const iv = setInterval(() => {
            t--;
            if (t > 0) {
                countdownOverlay.textContent = t;
            } else {
                clearInterval(iv);
                countdownOverlay.textContent = 'GO!';
                setTimeout(() => {
                    countdownOverlay.remove();
                    this.countdownActive = false;
                    this.drone.armDisarm(); 
                    this.isPaused = false;
                }, 500);
            }
        }, 1000);

        console.log('[SIM] Gate Racing countdown started');
    }

    startAcrobatic() {
        this.currentMode = 'acrobatic';
        this.lastGameMode = 'acrobatic';
        this.resetFlightStats();
        this.resetWorld(); 
        this.acroTrainer.reset();
        id('objective').textContent = 'Complete aerobatic challenges to master advanced flight!';
        id('flightMode').textContent = 'Acrobatic Training';
        this.showScreen('game');
        console.log('[SIM] Started Complete Acrobatic Training mode');
    }

    resetFlightStats() {
        this.score = 0;
        this.startTime = performance.now();
        this.flightStats = {
            maxSpeed: 0,
            avgSpeed: 0,
            totalDistance: 0,
            smoothness: 0,
            lastPosition: this.drone.position.clone()
        };
        this.drone.maxGForce = 1.0;
    }

    updateFlightStats(deltaTime) {
        const currentSpeed = this.drone.velocity.length();
        this.flightStats.maxSpeed = Math.max(this.flightStats.maxSpeed, currentSpeed);

        const distance = this.drone.position.distanceTo(this.flightStats.lastPosition);
        this.flightStats.totalDistance += distance;
        this.flightStats.lastPosition.copy(this.drone.position);

        
        const flightTime = (performance.now() - this.startTime) / 1000;
        this.flightStats.avgSpeed = this.flightStats.totalDistance / Math.max(flightTime, 0.1);

        
        const jerk = this.drone.acceleration.length();
        this.flightStats.smoothness = Math.max(0, 100 - jerk * 10);

        
        if (this.currentMode === 'acrobatic') {
            const progress = this.acroTrainer.update(this.drone, deltaTime);
            this.updateAcrobaticHUD(progress);
            if (this.acroTrainer.isComplete()) {
                this.completeMission();
            }
        }
    }

    updateAcrobaticHUD(progress) {
        const currentChallenge = this.acroTrainer.getCurrentChallenge();
        if (currentChallenge) {
            id('objective').textContent = `${currentChallenge.name}: ${currentChallenge.description} (${progress.completed}/${progress.total})`;
        } else {
            id('objective').textContent = `All challenges complete! (${progress.completed}/${progress.total})`;
        }
    }

    completeMission() {
        const endTime = performance.now();
        const totalSeconds = Math.floor((endTime - this.startTime) / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        
        id('finalScore').textContent = this.score;
        id('finalTime').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        id('gatesPassed').textContent = this.gates.getPassedCount();
        id('maxGForce').textContent = this.drone.maxGForce.toFixed(1) + 'g';
        id('avgSpeed').textContent = this.flightStats.avgSpeed.toFixed(1) + ' m/s';

        
        let flightStyle = 'Smooth';
        if (this.drone.maxGForce > 5) flightStyle = 'Aggressive';
        else if (this.drone.maxGForce > 3) flightStyle = 'Dynamic';
        else if (this.flightStats.smoothness > 80) flightStyle = 'Precise';

        id('flightStyle').textContent = flightStyle;
        this.showScreen('mission');
        console.log(`[SIM] Mission completed! Style: ${flightStyle}`);
    }

    
    updateRealisticCamera(deltaTime, currentTime) {
        const dronePosition = this.drone.position;
        const droneQuaternion = this.drone.mesh.quaternion;
        const droneVelocity = this.drone.velocity;

        switch (this.cameraMode) {
            case 'fpv':
                
                let fpvOffset = this.cameraOffset.clone();
                fpvOffset.applyQuaternion(droneQuaternion);
                this.camera.position.copy(dronePosition).add(fpvOffset);
                this.camera.quaternion.copy(droneQuaternion);
                break;

            case 'cockpit':
                
                const cockpitOffset = new THREE.Vector3(0, 0.05, 0.1);
                cockpitOffset.applyQuaternion(droneQuaternion);
                this.camera.position.copy(dronePosition).add(cockpitOffset);
                this.camera.quaternion.copy(droneQuaternion);
                break;

            case 'chase':
                
                const chaseDistance = 8;
                const chaseHeight = 3;
                const velocityPredict = droneVelocity.clone().multiplyScalar(0.5);
                const targetPos = dronePosition.clone().add(velocityPredict);
                const chaseOffset = new THREE.Vector3(0, chaseHeight, chaseDistance);
                chaseOffset.applyQuaternion(droneQuaternion);
                const cameraTarget = targetPos.clone().add(chaseOffset);
                this.camera.position.lerp(cameraTarget, deltaTime * 3);
                this.camera.lookAt(targetPos);
                break;

            case 'orbit':
                
                const radius = 15;
                const speed = currentTime * 0.0002;
                const orbitPos = new THREE.Vector3(
                    Math.cos(speed) * radius,
                    8,
                    Math.sin(speed) * radius
                );
                this.camera.position.copy(dronePosition).add(orbitPos);
                this.camera.lookAt(dronePosition);
                break;
        }
    }

    updateEnhancedHUD(currentTime) {
        
        id('altitude').textContent = `${this.drone.position.y.toFixed(1)} m`;
        id('speed').textContent = `${this.drone.velocity.length().toFixed(1)} m/s`;
        id('throttle').textContent = `${Math.round(this.drone.throttleInput * 100)}%`;
        id('battery').textContent = id('unlimited-battery-check')?.checked ? '∞' : `${Math.round(this.drone.battery)}%`;
        id('gforce').textContent = `${this.drone.getGForce().toFixed(1)}g`;
        id('currentRates').textContent = `${this.input.rates.max}°/s`;
        id('armStatus').textContent = this.drone.armed ? 'ARMED' : 'DISARMED';
        id('score').textContent = this.score;

        
        if (!this.isPaused && !this.countdownActive) {
            this.updateFlightStats(0.016);
        }

        
        if (this.debugEnabled) {
            const renderInfo = this.renderer.info.render;
            id('fps').textContent = Math.round(1000 / (currentTime - (this._lastFrameTime || currentTime)));
            id('drawCalls').textContent = renderInfo.calls;
            id('triangles').textContent = renderInfo.triangles.toLocaleString();
            id('debug-cam-mode').textContent = this.cameraMode;
            id('debug-drone-vel').textContent =
                `${this.drone.velocity.x.toFixed(1)},${this.drone.velocity.y.toFixed(1)},${this.drone.velocity.z.toFixed(1)}`;
            id('debug-angular-vel').textContent =
                `${this.drone.angularVelocity.x.toFixed(1)},${this.drone.angularVelocity.y.toFixed(1)},${this.drone.angularVelocity.z.toFixed(1)}`;
            id('debug-thrust').textContent = `${this.drone.motorThrusts.reduce((a, b) => a + b, 0).toFixed(1)}N`;
            id('debug-mass').textContent = `${this.drone.mass.toFixed(1)}kg`;
            id('debug-twr').textContent = `${DRONE_SPECS.THRUST_TO_WEIGHT.toFixed(1)}:1`;
            id('debug-gforce').textContent = `${this.drone.getGForce().toFixed(2)}g`;
            id('debug-motor-rpm').textContent = this.drone.getMotorRPM();
            id('debug-battery-voltage').textContent = `${this.drone.batteryVoltage.toFixed(1)}V`;

            
            const hid = this.input.getLastHIDPacket() || {};
            id('debug-hid').textContent = `R:${hid.roll||'--'} P:${hid.pitch||'--'} Y:${hid.yaw||'--'} T:${hid.throttle||'--'}`;
            
            const fwd = new THREE.Vector3(0, 0, -1)
                        .applyQuaternion(this.drone.mesh.quaternion)
                        .normalize();
            id('debug-facing').textContent =
                    `${fwd.x.toFixed(2)}, ${fwd.y.toFixed(2)}, ${fwd.z.toFixed(2)}`;
            
            this._lastFrameTime = currentTime;
        }
    }

    gameLoop(currentTime) {
        requestAnimationFrame((time) => this.gameLoop(time));
        
        const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.033);
        this.lastTime = currentTime;

        
        const controllerCount = this.input.update();
        id('controllers').textContent = controllerCount + (this.input.hasHID() ? '+HID' : '');

        
        const inputState = this.input.getState();
        const escapePressed = inputState[ACTIONS.MENU_TOGGLE];
        if (escapePressed && !this._escapePressed) {
            this.toggleMenu();
        }
        this._escapePressed = escapePressed;

        
        const armPressed = inputState[ACTIONS.ARM_DISARM];
        if (armPressed && !this._armPressed && !this.countdownActive) {
            this.drone.armDisarm();
        }
        this._armPressed = armPressed;

        
        if (!this.isPaused && !this.countdownActive) {
            
            const analogInputs = this.input.getAnalogInputs();
            this.drone.applyControls(analogInputs, deltaTime);
            this.drone.updatePhysics(deltaTime);

            
            if (this.currentMode === 'gate') {
                this.gates.checkGatePass(this.drone, (gateIndex) => {
                    this.score += 100 + Math.round(50 * this.drone.velocity.length());
                });
            }

            
            this.environment.update(this.drone.position);

            
            this.updateRealisticCamera(deltaTime, currentTime);
        }

        
        this.updateEnhancedHUD(currentTime);

        
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    if (typeof THREE === 'undefined') {
        alert('Three.js failed to load. Please ensure three.min.js is accessible.');
        return;
    }

    console.log('[BOOT] Three.js loaded successfully');
    console.log('[BOOT] Starting Complete Enhanced Realistic FPV Drone Simulator...');
    
    try {
        window.simulator = new RealisticDroneSimulator();
        console.log('[BOOT] Complete Enhanced Realistic Drone Simulator with true endless grass field ready!');
    } catch (error) {
        console.error('[BOOT] Failed to initialize simulator:', error);
        alert('Failed to initialize the complete enhanced realistic drone simulator. Check console for details.');
    }
});