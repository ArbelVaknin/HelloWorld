package com.vaknin.emmagames;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Minimal private file provider: lets the camera app write a full-size photo into
 * this app's cache (content://com.vaknin.emmagames.photos/<file>), which the game then reads.
 */
public class PhotoProvider extends ContentProvider {

    static File dir(Context c) {
        File d = new File(c.getCacheDir(), "photos");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    static File newPhotoFile(Context c) {
        return new File(dir(c), "cam_" + System.currentTimeMillis() + ".jpg");
    }

    static Uri uriFor(Context c, File f) {
        return Uri.parse("content://" + c.getPackageName() + ".photos/" + f.getName());
    }

    static void clearOldPhotos(Context c) {
        File[] files = dir(c).listFiles();
        if (files == null) return;
        //noinspection ResultOfMethodCallIgnored
        for (File f : files) f.delete();
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.contains("/") || name.contains("..")) throw new FileNotFoundException(String.valueOf(uri));
        return new File(dir(getContext()), name);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.parseMode(mode));
    }

    @Override
    public String getType(Uri uri) {
        return "image/jpeg";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File f;
        try {
            f = fileFor(uri);
        } catch (FileNotFoundException e) {
            return null;
        }
        String[] cols = projection != null ? projection : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor cursor = new MatrixCursor(cols);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
        }
        cursor.addRow(row);
        return cursor;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
