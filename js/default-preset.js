// 기본 캐릭터 프리셋. 사용자가 제공한 원본 Feather-Talk v2 백업(feathertalk-backup.json)을 그대로 옮긴 것.
// 이미지 데이터는 들어 있지 않고 /assets/*.png 경로만 가리킨다. 레이어 id는 불러올 때 새로 만든다.
export const DEFAULT_PRESET = {
  "version": 2,
  "center": {
    "x": 0.5,
    "y": 0.4,
    "r": 0.25
  },
  "rig": {
    "yaw": 100,
    "pitch": 100,
    "roll": 100,
    "bounce": 50,
    "breath": 50
  },
  "eyes": {
    "squash": false,
    "y": 0.4,
    "h": 0.05
  },
  "mouth": {
    "animate": true
  },
  "aspect": 1,
  "body": {
    "enabled": false,
    "joints": {
      "neck": {
        "x": 0.5,
        "y": 0.22
      },
      "waist": {
        "x": 0.5,
        "y": 0.45
      },
      "shoulderL": {
        "x": 0.37,
        "y": 0.25
      },
      "elbowL": {
        "x": 0.33,
        "y": 0.38
      },
      "wristL": {
        "x": 0.31,
        "y": 0.5
      },
      "shoulderR": {
        "x": 0.63,
        "y": 0.25
      },
      "elbowR": {
        "x": 0.67,
        "y": 0.38
      },
      "wristR": {
        "x": 0.69,
        "y": 0.5
      },
      "hipL": {
        "x": 0.45,
        "y": 0.53
      },
      "kneeL": {
        "x": 0.45,
        "y": 0.73
      },
      "ankleL": {
        "x": 0.45,
        "y": 0.93
      },
      "hipR": {
        "x": 0.55,
        "y": 0.53
      },
      "kneeR": {
        "x": 0.55,
        "y": 0.73
      },
      "ankleR": {
        "x": 0.55,
        "y": 0.93
      }
    },
    "radius": 0.15,
    "follow": 35,
    "sway": 50,
    "mirror": true,
    "poses": {
      "a": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "b": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "aLen": [
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1
      ],
      "bLen": [
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1
      ]
    },
    "playSpeed": 0.6
  },
  "layers": [
    {
      "id": "mvhb9q9k1zh2pl",
      "name": "앞머리",
      "src": {
        "type": "url",
        "value": "/assets/bang.png"
      },
      "part": "head",
      "show": "always",
      "expressions": [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true
      ],
      "visible": true,
      "depth": 30,
      "curve": 40,
      "hair": {
        "enabled": true,
        "dir": "down",
        "anchorY": 0.22,
        "sway": 50,
        "stiffness": 50,
        "bounce": 50
      },
      "clip": false,
      "pop": false
    },
    {
      "id": "mvhb9q9k206yue",
      "name": "입",
      "src": {
        "type": "url",
        "value": "/assets/mouth.png"
      },
      "part": "head",
      "show": "mouthClosed",
      "expressions": [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true
      ],
      "visible": true,
      "depth": 25,
      "curve": 30,
      "hair": {
        "enabled": false,
        "dir": "down",
        "anchorY": 0.25,
        "sway": 50,
        "stiffness": 50,
        "bounce": 50
      },
      "clip": false,
      "pop": false
    },
    {
      "id": "mvhb9q9k21u0xr",
      "name": "벌린 입",
      "src": {
        "type": "url",
        "value": "/assets/mouthopen.png"
      },
      "part": "head",
      "show": "mouthOpen",
      "expressions": [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true
      ],
      "visible": true,
      "depth": 25,
      "curve": 30,
      "hair": {
        "enabled": false,
        "dir": "down",
        "anchorY": 0.25,
        "sway": 50,
        "stiffness": 50,
        "bounce": 50
      },
      "clip": false,
      "pop": false
    },
    {
      "id": "mvhb9q9k22o8wu",
      "name": "눈",
      "src": {
        "type": "url",
        "value": "/assets/eyes.png"
      },
      "part": "head",
      "show": "eyesOpen",
      "expressions": [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true
      ],
      "visible": true,
      "depth": 25,
      "curve": 30,
      "hair": {
        "enabled": false,
        "dir": "down",
        "anchorY": 0.25,
        "sway": 50,
        "stiffness": 50,
        "bounce": 50
      },
      "clip": false,
      "pop": false
    },
    {
      "id": "mvhb9q9k23x7ve",
      "name": "감은 눈",
      "src": {
        "type": "url",
        "value": "/assets/eyesclosed.png"
      },
      "part": "head",
      "show": "eyesClosed",
      "expressions": [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true
      ],
      "visible": true,
      "depth": 25,
      "curve": 30,
      "hair": {
        "enabled": false,
        "dir": "down",
        "anchorY": 0.25,
        "sway": 50,
        "stiffness": 50,
        "bounce": 50
      },
      "clip": false,
      "pop": false
    },
    {
      "id": "mvhb9q9k24ywd5",
      "name": "얼굴",
      "src": {
        "type": "url",
        "value": "/assets/face.png"
      },
      "part": "head",
      "show": "always",
      "expressions": [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true
      ],
      "visible": true,
      "depth": 0,
      "curve": 40,
      "hair": {
        "enabled": false,
        "dir": "down",
        "anchorY": 0.25,
        "sway": 50,
        "stiffness": 50,
        "bounce": 50
      },
      "clip": false,
      "pop": false
    },
    {
      "id": "mvhb9q9k25k3ck",
      "name": "몸",
      "src": {
        "type": "url",
        "value": "/assets/body.png"
      },
      "part": "body",
      "show": "always",
      "expressions": [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true
      ],
      "visible": true,
      "depth": 0,
      "curve": 0,
      "hair": {
        "enabled": false,
        "dir": "down",
        "anchorY": 0.25,
        "sway": 50,
        "stiffness": 50,
        "bounce": 50
      },
      "clip": false,
      "pop": false
    },
    {
      "id": "mvhb9q9k264dwm",
      "name": "뒷머리",
      "src": {
        "type": "url",
        "value": "/assets/back.png"
      },
      "part": "head",
      "show": "always",
      "expressions": [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true
      ],
      "visible": true,
      "depth": -12,
      "curve": -20,
      "hair": {
        "enabled": true,
        "dir": "down",
        "anchorY": 0.3,
        "sway": 40,
        "stiffness": 40,
        "bounce": 50
      },
      "clip": false,
      "pop": false
    }
  ]
};
