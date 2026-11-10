package com.vaknin.emmagames;

import android.app.Activity;
import android.Manifest;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

/** Hosts the offline HTML games (checkers + backgammon) bundled in assets/. */
public class MainActivity extends Activity {
    private static final int REQ_PHOTO = 1;
    private static final int REQ_MIC = 2;
    private static final int MAX_LAUGH_MS = 10000;

    private WebView web;
    private ValueCallback<Uri[]> photoCallback;
    private Uri cameraUri;
    private boolean usedCamera;

    private MediaRecorder recorder;
    private File laughFile;
    private long recStart;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        PhotoProvider.clearOldPhotos(this);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(0x1b, 0x14, 0x10));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                return choosePhoto(callback, params.isCaptureEnabled());
            }
        });
        web.addJavascriptInterface(new RecBridge(), "AndroidRec");
        setContentView(web);

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/index.html");
    }

    /** "צילום" opens the camera, "מהגלריה" opens the photo picker. */
    private boolean choosePhoto(ValueCallback<Uri[]> callback, boolean camera) {
        if (photoCallback != null) photoCallback.onReceiveValue(null);
        photoCallback = callback;
        usedCamera = camera;
        Intent intent;
        if (camera) {
            File f = PhotoProvider.newPhotoFile(this);
            cameraUri = PhotoProvider.uriFor(this, f);
            intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            intent.setClipData(ClipData.newRawUri("photo", cameraUri));
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } else {
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType("image/*");
            intent = Intent.createChooser(pick, "בחירת תמונה");
        }
        try {
            startActivityForResult(intent, REQ_PHOTO);
        } catch (Exception e) {
            photoCallback.onReceiveValue(null);
            photoCallback = null;
        }
        return true;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_PHOTO || photoCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (usedCamera) result = new Uri[]{cameraUri};
            else if (data != null && data.getData() != null) result = new Uri[]{data.getData()};
        }
        photoCallback.onReceiveValue(result);
        photoCallback = null;
    }

    // ---------- laugh recording (called from JS as window.AndroidRec.start()/stop()/cancel()) ----------
    private class RecBridge {
        @JavascriptInterface public void start() { runOnUiThread(MainActivity.this::requestRecording); }
        @JavascriptInterface public void stop() { runOnUiThread(() -> finishRecording(true)); }
        @JavascriptInterface public void cancel() { runOnUiThread(() -> finishRecording(false)); }
    }

    /** Sends an event to the page: started | done(base64 m4a) | denied | error | short */
    private void recEvent(String ev, String base64) {
        String arg = base64 == null ? "null" : "'" + base64 + "'";
        web.evaluateJavascript("window.onAndroidRec && window.onAndroidRec('" + ev + "', " + arg + ")", null);
    }

    private void requestRecording() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
            return;
        }
        startRecording();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQ_MIC) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startRecording();
        else recEvent("denied", null);
    }

    @SuppressWarnings("deprecation")
    private void startRecording() {
        releaseRecorder();
        laughFile = new File(getCacheDir(), "laugh.m4a");
        try {
            recorder = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioChannels(1);
            recorder.setAudioSamplingRate(44100);
            recorder.setAudioEncodingBitRate(48000);
            recorder.setMaxDuration(MAX_LAUGH_MS);
            recorder.setOnInfoListener((mr, what, extra) -> {
                if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) finishRecording(true);
            });
            recorder.setOutputFile(laughFile.getAbsolutePath());
            recorder.prepare();
            recorder.start();
            recStart = System.currentTimeMillis();
            recEvent("started", null);
        } catch (Exception e) {
            releaseRecorder();
            recEvent("error", null);
        }
    }

    private void finishRecording(boolean keep) {
        if (recorder == null) return;
        boolean ok = true;
        try {
            recorder.stop();
        } catch (RuntimeException e) {
            ok = false; // stopped right after starting: nothing recorded
        }
        releaseRecorder();
        if (!keep) return;
        if (!ok || System.currentTimeMillis() - recStart < 500) { recEvent("short", null); return; }
        try (FileInputStream in = new FileInputStream(laughFile)) {
            byte[] bytes = new byte[(int) laughFile.length()];
            int off = 0, n;
            while (off < bytes.length && (n = in.read(bytes, off, bytes.length - off)) > 0) off += n;
            recEvent("done", Base64.encodeToString(bytes, 0, off, Base64.NO_WRAP));
        } catch (IOException e) {
            recEvent("error", null);
        }
    }

    private void releaseRecorder() {
        if (recorder != null) {
            try { recorder.release(); } catch (Exception ignored) { }
            recorder = null;
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // don't keep the microphone open in the background
        if (recorder != null) { finishRecording(false); recEvent("error", null); }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN);
    }

    /** Back closes dialogs / goes from a game to the menu; from the menu it closes the app. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("window.androidBack ? window.androidBack() : false", value -> {
            if (!"true".equals(value)) finish();
        });
    }
}
