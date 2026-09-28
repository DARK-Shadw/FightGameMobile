package com.skillforge.arena;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * The whole app: a full-screen WebView showing the offline game page from the APK's assets, plus
 * the SFNative bridge for LAN play (see src/net/PROTOCOL.md).
 */
public class MainActivity extends Activity {
    static final String TAG = NativeBridge.TAG;
    static final String PAGE = "file:///android_asset/www/index.html";
    static final int BG = 0xff140a26;
    /** WifiManager.WIFI_MODE_FULL_LOW_LATENCY (API 29); the API-23 SDK does not name it. */
    static final int WIFI_MODE_FULL_LOW_LATENCY = 4;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private WebView web;
    private NativeBridge bridge;
    private WifiManager.WifiLock wifiLock;
    private boolean backPending;

    private final Runnable hideBars = new Runnable() {
        @Override public void run() { hideSystemUi(); }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        w.setBackgroundDrawable(new ColorDrawable(BG));

        // lets chrome://inspect attach to the page over USB (logcat has the console too)
        WebView.setWebContentsDebuggingEnabled(true);

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setHapticFeedbackEnabled(false);
        // no text-selection popup when a thumb rests on the screen
        web.setOnLongClickListener(new View.OnLongClickListener() {
            @Override public boolean onLongClick(View v) { return true; }
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // WebAudio starts without a tap
        s.setAllowFileAccess(true);                    // file:///android_asset/
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);                            // ignore the system font size: the HUD is laid out in px

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                String line = m.message() + "  (" + m.sourceId() + ":" + m.lineNumber() + ")";
                ConsoleMessage.MessageLevel level = m.messageLevel();
                if (level == ConsoleMessage.MessageLevel.ERROR) Log.e(TAG, line);
                else if (level == ConsoleMessage.MessageLevel.WARNING) Log.w(TAG, line);
                else if (level == ConsoleMessage.MessageLevel.LOG) Log.i(TAG, line);
                else Log.d(TAG, line);
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url == null || url.startsWith("file:///android_asset/")) return false;
                // anything else (a credits link, say) opens outside the game
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception e) {
                    Log.w(TAG, "cannot open " + url, e);
                }
                return true;
            }
        });

        bridge = new NativeBridge(getApplicationContext(), web, versionName());
        web.addJavascriptInterface(bridge, "SFNative");

        setContentView(web);
        w.getDecorView().setOnSystemUiVisibilityChangeListener(new View.OnSystemUiVisibilityChangeListener() {
            @Override public void onSystemUiVisibilityChange(int visibility) {
                // something (the keyboard, a dialog) brought the bars back: hide them again shortly
                if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) {
                    ui.removeCallbacks(hideBars);
                    ui.postDelayed(hideBars, 1500);
                }
            }
        });
        hideSystemUi();
        web.loadUrl(PAGE);
    }

    /** Immersive sticky: no status or navigation bar; a swipe shows them briefly over the game. */
    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        hideSystemUi();
        acquireWifiLock();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        releaseWifiLock();
        super.onPause();
    }

    /** The page decides: window.SFBack() returning true means it handled Back; otherwise we leave. */
    @Override
    public void onBackPressed() {
        if (web == null) {
            finish();
            return;
        }
        if (backPending) return;
        backPending = true;
        web.evaluateJavascript("(function(){try{return window.SFBack?window.SFBack():false}catch(e){return false}})()",
                new ValueCallback<String>() {
                    @Override public void onReceiveValue(String value) {
                        backPending = false;
                        if (!"true".equals(value) && !isFinishing()) finish();
                    }
                });
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        if (bridge != null) bridge.shutdown();
        bridge = null;
        releaseWifiLock();
        if (web != null) {
            web.removeJavascriptInterface("SFNative");
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web);
            web.stopLoading();
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Keeps Wi-Fi out of power save while the game is on screen: lower, steadier LAN latency. */
    private void acquireWifiLock() {
        try {
            if (wifiLock == null) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm == null) return;
                int mode = Build.VERSION.SDK_INT >= 29 ? WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                wifiLock = wm.createWifiLock(mode, "sfa-game");
                wifiLock.setReferenceCounted(false);
            }
            wifiLock.acquire();
        } catch (Exception e) {
            Log.w(TAG, "wifi lock failed", e);
        }
    }

    private void releaseWifiLock() {
        try {
            if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        } catch (Exception e) {
            Log.w(TAG, "wifi lock release failed", e);
        }
    }

    private String versionName() {
        try {
            String v = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            return v != null ? v : "1.0";
        } catch (Exception e) {
            return "1.0";
        }
    }
}
