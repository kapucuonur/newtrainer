package com.roadlab.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

/**
 * Capacitor host. Requests BLE runtime permissions so a future native BLE plugin
 * (or Chrome Custom Tabs flow) can scan/connect. Keeps the screen on during rides.
 */
public class MainActivity extends BridgeActivity {
    private static final int BLE_PERMS_REQ = 4242;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        requestBlePermissionsIfNeeded();
    }

    private void requestBlePermissionsIfNeeded() {
        List<String> needed = new ArrayList<>();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            addIfMissing(needed, Manifest.permission.BLUETOOTH_SCAN);
            addIfMissing(needed, Manifest.permission.BLUETOOTH_CONNECT);
        } else {
            addIfMissing(needed, Manifest.permission.ACCESS_FINE_LOCATION);
            addIfMissing(needed, Manifest.permission.BLUETOOTH);
            addIfMissing(needed, Manifest.permission.BLUETOOTH_ADMIN);
        }

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), BLE_PERMS_REQ);
        }
    }

    private void addIfMissing(List<String> out, String permission) {
        if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
            out.add(permission);
        }
    }
}
