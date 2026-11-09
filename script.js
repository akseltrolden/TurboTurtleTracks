
/* =========================================================
   TURBOTURTLE TRACKS — COMPLETE PLAYER
   Google Drive Picker + Local MP3 + Playback Controls
   ========================================================= */

const CONFIG = {
  apiKey: "AIzaSyAz9E0AyMC6Z8mu05gR7XwOMLS4N2xD-yM",
  clientId: "87091080499-n7a33qqf11s2opona9l7ffa81do2qqnq.apps.googleusercontent.com",
  projectNumber: "87091080499"
};

const SCOPES = "https://www.googleapis.com/auth/drive.file";

/* 2. PAGE ELEMENTS */

const driveBtn = document.getElementById("driveBtn");
const fileInput = document.getElementById("fileInput");
const audio = document.getElementById("audio");
const status = document.getElementById("status");
const trackName = document.getElementById("trackName");
const trackSource = document.getElementById("trackSource");
const playBtn = document.getElementById("playBtn");
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");
const seek = document.getElementById("seek");
const currentTime = document.getElementById("currentTime");
const duration = document.getElementById("duration");
const speedValue = document.getElementById("speedValue");
const speedSlider = document.getElementById("speedSlider");
const speedButtons = document.getElementById("speedButtons");
const pitchToggle = document.getElementById("pitchToggle");
const volume = document.getElementById("volume");

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let pickerReady = false;
let googleInitialization = null;
let currentObjectUrl = null;

/* 3. GENERAL HELPERS */

function setStatus(message) {
  status.textContent = message;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return minutes + ":" + String(remainingSeconds).padStart(2, "0");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="' + src + '"]'
    );

    if (existing) {
      if (src.includes("api.js") && window.gapi) {
        resolve();
        return;
      }

      if (src.includes("gsi/client") &&
          window.google?.accounts?.oauth2) {
        resolve();
        return;
      }

      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Could not load Google services.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;

    script.onload = resolve;
    script.onerror = () =>
      reject(new Error("Could not load Google services."));

    document.head.appendChild(script);
  });
}

/* 4. GOOGLE DRIVE INITIALIZATION
   This runs at page startup, not when the user clicks.
*/

async function initializeGoogle() {
  if (googleInitialization) return googleInitialization;

  googleInitialization = (async () => {
    if (
      !CONFIG.apiKey ||
      CONFIG.apiKey.includes("PASTE_") ||
      !CONFIG.clientId ||
      CONFIG.clientId.includes("PASTE_") ||
      !CONFIG.projectNumber ||
      CONFIG.projectNumber.includes("PASTE_")
    ) {
      throw new Error("Enter your three Google credentials in CONFIG.");
    }

    await Promise.all([
      loadScript("https://apis.google.com/js/api.js"),
      loadScript("https://accounts.google.com/gsi/client")
    ]);

    await new Promise((resolve, reject) => {
      window.gapi.load("picker", {
        callback: resolve,
        onerror: () => reject(
          new Error("Google Picker could not initialize.")
        ),
        timeout: 10000,
        ontimeout: () => reject(
          new Error("Google Picker initialization timed out.")
        )
      });
    });

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.clientId,
      scope: SCOPES,

      callback: (response) => {
        if (response.error) {
          setStatus("Google sign-in failed: " + response.error);
          return;
        }

        accessToken = response.access_token;
        tokenExpiresAt =
          Date.now() + Number(response.expires_in || 3600) * 1000;

        setStatus("Connected to Google Drive. Choose an MP3.");
        showDrivePicker();
      },

      error_callback: (error) => {
        setStatus(
          "Google sign-in could not open: " +
          (error.message || error.type || "Unknown error")
        );
      }
    });

    pickerReady = true;
    driveBtn.disabled = false;
    setStatus("Ready to play.");
  })();

  try {
    await googleInitialization;
  } catch (error) {
    googleInitialization = null;
    pickerReady = false;
    driveBtn.disabled = false;
    setStatus("Google Drive setup error: " + error.message);
    console.error("Google initialization error:", error);
  }
}

/* 5. GOOGLE DRIVE BUTTON
   requestAccessToken() is called synchronously from this click.
*/

driveBtn.addEventListener("click", () => {
  if (!pickerReady || !tokenClient) {
    setStatus("Google Drive is still initializing. Please try again.");
    return;
  }

  if (accessToken && Date.now() < tokenExpiresAt - 60000) {
    showDrivePicker();
    return;
  }

  setStatus("Opening Google sign-in...");

  // This call must remain directly inside the click handler.
  tokenClient.requestAccessToken();
});

/* 6. GOOGLE PICKER */

function showDrivePicker() {
  if (!accessToken) {
    setStatus("Please connect to Google Drive first.");
    return;
  }

  const view = new google.picker.DocsView(
    google.picker.ViewId.DOCS
  );

  view.setMimeTypes("audio/mpeg");
  view.setIncludeFolders(false);

  const picker = new google.picker.PickerBuilder()
    .setDeveloperKey(CONFIG.apiKey)
    .setAppId(CONFIG.projectNumber)
    .setOAuthToken(accessToken)
    .addView(view)
    .setTitle("Choose an MP3 from Google Drive")
    .setCallback(pickerCallback)
    .build();

  picker.setVisible(true);
  setStatus("Choose an MP3 from Google Drive.");
}

async function pickerCallback(data) {
  if (data.action === google.picker.Action.CANCEL) {
    setStatus("Drive selection cancelled.");
    return;
  }

  if (data.action !== google.picker.Action.PICKED) return;

  const selectedFile = data.docs && data.docs[0];

  if (!selectedFile || !selectedFile.id) {
    setStatus("No file was selected.");
    return;
  }

  await loadDriveFile(selectedFile.id, selectedFile.name);
}

/* 7. DOWNLOAD AND LOAD DRIVE MP3 */

async function loadDriveFile(fileId, fallbackName) {
  try {
    setStatus("Loading MP3 from Google Drive...");

    const headers = {
      Authorization: "Bearer " + accessToken
    };

    const metadataResponse = await fetch(
      "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(fileId) +
      "?fields=name,mimeType,size",
      { headers }
    );

    if (!metadataResponse.ok) {
      throw new Error(
        "Could not read file details (" +
        metadataResponse.status + ")."
      );
    }

    const metadata = await metadataResponse.json();

    if (
      metadata.mimeType !== "audio/mpeg" &&
      !String(metadata.name || fallbackName).toLowerCase().endsWith(".mp3")
    ) {
      throw new Error("The selected file does not appear to be an MP3.");
    }

    const mediaResponse = await fetch(
      "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(fileId) +
      "?alt=media",
      { headers }
    );

    if (!mediaResponse.ok) {
      throw new Error(
        "Could not download the MP3 (" +
        mediaResponse.status + ")."
      );
    }

    const blob = await mediaResponse.blob();

    if (!blob.size) {
      throw new Error("The downloaded audio file is empty.");
    }

    loadAudioBlob(blob, metadata.name || fallbackName, "Google Drive");

  } catch (error) {
    console.error("Drive file error:", error);
    setStatus("Drive error: " + error.message);
  }
}

/* 8. LOCAL MP3 FILE SELECTION */

fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];

  if (!file) {
    setStatus("No file selected.");
    return;
  }

  if (
    file.type &&
    file.type !== "audio/mpeg" &&
    !file.name.toLowerCase().endsWith(".mp3")
  ) {
    setStatus("Please select an MP3 file.");
    return;
  }

  loadAudioBlob(file, file.name, "Local file");
});

/* 9. LOAD AUDIO */

function loadAudioBlob(blob, name, source) {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }

  currentObjectUrl = URL.createObjectURL(blob);

  audio.pause();
  audio.src = currentObjectUrl;
  audio.load();

  trackName.textContent = name;
  trackSource.textContent = source;

  seek.value = 0;
  currentTime.textContent = "0:00";
  duration.textContent = "0:00";
  playBtn.textContent = "▶";

  setStatus("Loaded: " + name + ". Ready to play.");
}

/* 10. PLAY / PAUSE */

playBtn.addEventListener("click", async () => {
  if (!audio.src) {
    setStatus("Please select an MP3 first.");
    return;
  }

  if (audio.paused) {
    try {
      await audio.play();
    } catch (error) {
      setStatus("Playback error: " + error.message);
    }
  } else {
    audio.pause();
  }
});

audio.addEventListener("playing", () => {
  playBtn.textContent = "Ⅱ";
  setStatus("Playing: " + trackName.textContent);
});

audio.addEventListener("pause", () => {
  playBtn.textContent = "▶";

  if (audio.src && audio.currentTime > 0) {
    setStatus("Paused.");
  }
});

audio.addEventListener("ended", () => {
  playBtn.textContent = "▶";
  setStatus("Playback finished.");
});

audio.addEventListener("error", () => {
  if (audio.src) {
    setStatus("Audio playback failed. Check the file format.");
  }
});

/* 11. TIME AND SEEKING */

audio.addEventListener("loadedmetadata", () => {
  duration.textContent = formatTime(audio.duration);
  seek.value = 0;
  setStatus("Loaded: " + trackName.textContent + ". Ready to play.");
});

audio.addEventListener("timeupdate", () => {
  currentTime.textContent = formatTime(audio.currentTime);

  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    seek.value = (audio.currentTime / audio.duration) * 100;
  }
});

seek.addEventListener("input", () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    audio.currentTime = (Number(seek.value) / 100) * audio.duration;
  }
});

backBtn.addEventListener("click", () => {
  audio.currentTime = Math.max(0, audio.currentTime - 10);
});

forwardBtn.addEventListener("click", () => {
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = Math.min(
      audio.duration,
      audio.currentTime + 10
    );
  }
});

/* 12. PLAYBACK SPEED */

function setSpeed(speed) {
  const rate = Math.max(0.5, Math.min(3, Number(speed)));

  audio.playbackRate = rate;
  speedSlider.value = rate;
  speedValue.textContent = rate.toFixed(2) + "×";

  speedButtons.querySelectorAll("button").forEach((button) => {
    button.classList.toggle(
      "selected",
      Math.abs(Number(button.dataset.speed) - rate) < 0.001
    );
  });
}

speedButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-speed]");
  if (!button) return;

  setSpeed(button.dataset.speed);
});

speedSlider.addEventListener("input", () => {
  setSpeed(speedSlider.value);
});

/* 13. PITCH PRESERVATION */

function updatePitchPreservation() {
  const enabled = pitchToggle.checked;

  audio.preservesPitch = enabled;
  audio.webkitPreservesPitch = enabled;
  audio.mozPreservesPitch = enabled;
}

pitchToggle.addEventListener("change", updatePitchPreservation);

/* 14. VOLUME */

volume.addEventListener("input", () => {
  audio.volume = Number(volume.value);
});

/* 15. INITIAL PLAYER SETTINGS */

audio.volume = Number(volume.value);
setSpeed(speedSlider.value);
updatePitchPreservation();

playBtn.textContent = "▶";
driveBtn.disabled = true;

setStatus("Preparing Google Drive connection...");

/* 16. START GOOGLE SERVICES */

initializeGoogle();

console.log("TurboTurtle Tracks player initialized.");
