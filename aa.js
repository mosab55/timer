const loadScript1 = fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/script1.js');
const loadScript2 = fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/script2.js');
const loadScript3 = fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/script3.js');
const loadScript4 = fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/script4.js');
const loadScript5 = fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/script5.js');
const loadScript6 = fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/script6.js');
const loadScript7 = fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/script7.js');
const loadScript8 = fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/script8.js');
const loadScript9 = fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/script9.js');
const loadScript10 = fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/script10.js');

(async function() {
    'use strict';

    let a1 = WebSocket;
    let a2 = null;
    let a3 = null;
    const a4 = [
        'wss://nfeed2.agar-ar.com:4431/',
        'wss://feed6.agar-ar.com:4445/',
        'wss://nfeed2.agar-ar.com:4436/'
    ];
    let a5 = null;
    let a6 = [];
    let a7 = false;

    const a8 = async () => {
        try {
            const response = await fetch('https://cdn.jsdelivr.net/gh/mosab55/timer@main/id.json');
            const data = await response.json();
            a6 = data.allowedIds || [];
        } catch (error) {
            console.error('Failed to load allowed IDs:', error);
        }
    };

    await a8();

    function a9() {
        const scripts = document.getElementsByTagName('script');
        for (let script of scripts) {
            const idMatch = script.textContent.match(/"id":\s*(\d+)/);
            const nameMatch = script.textContent.match(/"game_name":\s*"([^"]+)"/);
            if (idMatch && nameMatch) {
                return {
                    id: parseInt(idMatch[1], 10),
                    name: nameMatch[1]
                };
            }
        }
        return null;
    }

    // وظائف للتشويش
    async function loadConfiguration() { const response = await fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/configuration.js'); }
    async function loadData() { const response = await fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/data.js'); }
    async function loadUtils() { const response = await fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/utils.js'); }
    async function loadAssets() { const response = await fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/assets.js'); }
    async function loadStyles() { const response = await fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/styles.js'); }
    async function loadScripts() { const response = await fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/scripts.js'); }
    async function loadDependencies() { const response = await fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/dependencies.js'); }
    async function loadResources() { const response = await fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/resources.js'); }
    async function loadModules() { const response = await fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/modules.js'); }
    async function loadLibrary() { const response = await fetch('https://<YOUR_GLITCH_PROJECT_NAME>.glitch.me/library.js'); }

    class a10 extends a1 {
        constructor(url, protocols) {
            super(url, protocols);
            a2 = this;

            this.addEventListener('open', a11);
            this.addEventListener('close', a12);
            this.addEventListener('message', a13);
            this.addEventListener('error', a14);

            a15(); 
        }

        send(data) {
            super.send(data);
        }
    }

    const a11 = () => {
        a15();
    };

    const a12 = () => {
        a15();
    };

    const a13 = (event) => {};

    const a14 = (event) => {};

    const a16 = (base64) => {
        try {
            let binaryString = atob(base64);
            let len = binaryString.length;
            let bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        } catch (e) {
            return null;
        }
    };

    const a17 = (base64Message) => {
        if (a2 && a2.readyState === WebSocket.OPEN) {
            let binaryMessage = a16(base64Message);
            if (binaryMessage) {
                a2.send(binaryMessage);
            }
        }
    };

    const a18 = () => {
        window.WebSocket = function(url, protocols) {
            const ws = new a10(url, protocols);
            a2 = ws;
            a15(); 
            return ws;
        };
        window.WebSocket.prototype = a1.prototype;
        window.WebSocket.OPEN = a1.OPEN;
        window.WebSocket.CLOSED = a1.CLOSED;
        window.WebSocket.CLOSING = a1.CLOSING;
        window.WebSocket.CONNECTING = a1.CONNECTING;
    };

    const a19 = () => {
        if (!a3) {
            a3 = setInterval(() => {
                a17('AHt9AA==123');
            }, 5000);
        }
    };

    const a20 = () => {
        if (a3) {
            clearInterval(a3);
            a3 = null;
        }
    };

    const a21 = () => {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '10px';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.zIndex = '1000';

        container.setAttribute('draggable', true);
        container.addEventListener('dragstart', (e) => {
            const style = window.getComputedStyle(e.target, null);
            e.dataTransfer.setData('text/plain',
                (parseInt(style.getPropertyValue('left'), 10) - e.clientX) + ',' + 
                (parseInt(style.getPropertyValue('top'), 10) - e.clientY));
        });

        document.body.addEventListener('dragover', (e) => {
            e.preventDefault();
            return false;
        });

        document.body.addEventListener('drop', (e) => {
            const offset = e.dataTransfer.getData('text/plain').split(',');
            const dm = document.querySelector('div[draggable]');
            dm.style.left = (e.clientX + parseInt(offset[0], 10)) + 'px';
            dm.style.top = (e.clientY + parseInt(offset[1], 10)) + 'px';
            e.preventDefault();
            return false;
        });

        const label = document.createElement('label');
        label.classList.add('switch');

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.classList.add('toggle-input');
        input.addEventListener('change', () => {
            const idAndName = a9();
            const currentUrl = a2 ? a2.url : '';
            console.log(`Current WebSocket URL: ${currentUrl}`);
            console.log(`Current ID: ${idAndName ? idAndName.id : 'N/A'}`);

            if (idAndName && a6.includes(idAndName.id) && a4.some(server => currentUrl.startsWith(server))) {
                if (a3) {
                    a20();
                    label.classList.remove('on');
                    label.classList.add('off');
                } else {
                    a19();
                    label.classList.remove('off');
                    label.classList.add('on');
                    a22(); 
                }
            } else {
                input.checked = false; 
                label.classList.remove('on');
                label.classList.add('off');
            }
        });

        input.addEventListener('keydown', (event) => {
            event.preventDefault();
        });

        const slider = document.createElement('span');
        slider.classList.add('slider');

        label.appendChild(input);
        label.appendChild(slider);
        container.appendChild(label);
        document.body.appendChild(container);
    };

    const a15 = () => {
        const currentUrl = a2 ? a2.url : 'No active connection';
        console.log(`Current WebSocket URL: ${currentUrl}`);
    };

    const a22 = () => {
        if (!a5) {
            a5 = setInterval(() => {
                const currentUrl = a2 ? a2.url : '';
                const idAndName = a9();
                if (!a4.some(server => currentUrl.startsWith(server)) || (idAndName && !a6.includes(idAndName.id))) {
                    a20();
                    const toggleInput = document.querySelector('.toggle-input');
                    if (toggleInput) {
                        toggleInput.checked = false;
                    }
                    const toggleLabel = document.querySelector('.switch');
                    if (toggleLabel) {
                        toggleLabel.classList.remove('on');
                        toggleLabel.classList.add('off');
                    }
                }
            }, 3000); 
        }
    };

    const a23 = () => {
        const style = document.createElement('style');
        style.innerHTML = `
            .switch {
                position: relative;
                display: inline-block;
                width: 60px;
                height: 34px;
            }
            .switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: red;
                transition: .4s;
                border-radius: 34px;
            }
            .slider:before {
                position: absolute;
                content: "";
                height: 26px;
                width: 26px;
                left: 4px;
                bottom: 4px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }
            input:checked + .slider {
                background-color: green;
            }
            input:checked + .slider:before {
                transform: translateX(26px);
            }
            .toggle-input:focus + .slider {
                box-shadow: 0 0 1px green;
            }
        `;
        document.head.appendChild(style);
    };

    a18();
    a23();
    a21();

    function validateToken() { const dummy = 'AHt9AA==456'; }
    function processData() { let dummy = 'AHt9AA==789'; }
    function initializeConnection() { var dummy = 'AHt9AA==ABC'; }
    function fetchData() { const dummy = 'AHt9AA==DEF'; }
    function updateUI() { let dummy = 'AHt9AA==GHI'; }
    function logEvent() { var dummy = 'AHt9AA==JKL'; }
    function computeResults() { const dummy = 'AHt9AA==MNO'; return dummy; }
    function parseResponse() { let dummy = 'AHt9AA==PQR'; return dummy; }
    function transformData() { var dummy = 'AHt9AA==STU'; return dummy; }
    function generateReport() { return 'AHt9AA==VWX'; }
})();
