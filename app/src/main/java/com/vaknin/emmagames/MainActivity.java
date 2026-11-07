package com.vaknin.emmagames;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;

/** Hosts the offline HTML games (checkers + backgammon) bundled in assets/. */
public class MainActivity extends Activity {
    private static final int REQ_PHOTO = 1;

    private WebView web;
    private ValueCallback<Uri[]> photoCallback;
    private Uri cameraUri;
    private boolean usedCamera;

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
