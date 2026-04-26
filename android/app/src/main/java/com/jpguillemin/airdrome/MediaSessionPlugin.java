package com.jpguillemin.airdrome;

import android.support.v4.media.session.PlaybackStateCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MediaSession")
public class MediaSessionPlugin extends Plugin {
    private MediaSessionManager manager;

    @Override
    public void load() {
        super.load();
        manager = MediaSessionManager.get(getContext());
        manager.setListener(new MediaSessionManager.TransportListener() {
            @Override public void onPlay() { notifyListeners("play", new JSObject()); }
            @Override public void onPause() { notifyListeners("pause", new JSObject()); }
            @Override public void onSkipToNext() { notifyListeners("next", new JSObject()); }
            @Override public void onSkipToPrevious() { notifyListeners("previous", new JSObject()); }
            @Override public void onSeekTo(long pos) {
                JSObject data = new JSObject();
                data.put("position", pos / 1000.0);
                notifyListeners("seek", data);
            }
            @Override public void onStop() { notifyListeners("stop", new JSObject()); }
        });
    }

    @PluginMethod
    public void setMetadata(PluginCall call) {
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        String album = call.getString("album", "");
        String artworkUrl = call.getString("artworkUrl", null);
        Double duration = call.getDouble("duration", 0.0);
        long durationMs = (long) (duration * 1000.0);
        manager.setMetadata(title, artist, album, artworkUrl, durationMs);
        call.resolve();
    }

    @PluginMethod
    public void setPlaybackState(PluginCall call) {
        String state = call.getString("state", "none");
        Double position = call.getDouble("position", 0.0);
        Double speed = call.getDouble("speed", 1.0);
        int pbState;
        switch (state) {
            case "playing": pbState = PlaybackStateCompat.STATE_PLAYING; break;
            case "paused":  pbState = PlaybackStateCompat.STATE_PAUSED;  break;
            case "stopped": pbState = PlaybackStateCompat.STATE_STOPPED; break;
            default:        pbState = PlaybackStateCompat.STATE_NONE;    break;
        }
        long positionMs = (long) (position * 1000.0);
        manager.setPlaybackState(pbState, positionMs, speed.floatValue());
        call.resolve();
    }
}
