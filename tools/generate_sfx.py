import math
import wave
import struct
import random
import os

# Configuration
SAMPLE_RATE = 44100
VOLUME = 0.5

def save_wav(filename, data):
    """Saves raw audio data to a WAV file."""
    # Ensure directory exists
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    
    with wave.open(filename, 'w') as w:
        w.setnchannels(1)  # Mono
        w.setsampwidth(2)  # 16-bit
        w.setframerate(SAMPLE_RATE)
        
        # Convert float samples (-1.0 to 1.0) to 16-bit integers
        # Clip to avoid distortion
        int_data = []
        for s in data:
            s = max(-1.0, min(1.0, s))
            int_data.append(int(s * 32767))
            
        w.writeframes(struct.pack('<' + 'h' * len(int_data), *int_data))
    print(f"Generated: {filename}")

def generate_sine(freq, duration):
    """Generates a sine wave."""
    n_samples = int(SAMPLE_RATE * duration)
    data = []
    for i in range(n_samples):
        t = i / SAMPLE_RATE
        data.append(math.sin(2 * math.pi * freq * t))
    return data

def generate_square(freq, duration):
    """Generates a square wave."""
    n_samples = int(SAMPLE_RATE * duration)
    data = []
    for i in range(n_samples):
        t = i / SAMPLE_RATE
        val = 1.0 if math.sin(2 * math.pi * freq * t) > 0 else -1.0
        data.append(val)
    return data

def generate_sawtooth(freq, duration):
    """Generates a sawtooth wave."""
    n_samples = int(SAMPLE_RATE * duration)
    data = []
    period = 1.0 / freq
    for i in range(n_samples):
        t = i / SAMPLE_RATE
        val = 2.0 * (t / period - math.floor(t / period + 0.5))
        data.append(val)
    return data

def generate_noise(duration):
    """Generates white noise."""
    n_samples = int(SAMPLE_RATE * duration)
    data = []
    for _ in range(n_samples):
        data.append(random.uniform(-1, 1))
    return data

def apply_envelope(data, attack, decay, sustain_level, release):
    """Applies ADSR envelope."""
    n = len(data)
    a_samples = int(attack * SAMPLE_RATE)
    d_samples = int(decay * SAMPLE_RATE)
    r_samples = int(release * SAMPLE_RATE)
    s_samples = n - a_samples - d_samples - r_samples
    
    # If total time is too short, scale down
    total_env = a_samples + d_samples + r_samples
    if total_env > n:
        factor = n / total_env
        a_samples = int(a_samples * factor)
        d_samples = int(d_samples * factor)
        r_samples = int(r_samples * factor)
        s_samples = 0

    output = []
    for i in range(n):
        val = data[i]
        amp = 0.0
        if i < a_samples:
            amp = i / a_samples
        elif i < a_samples + d_samples:
            rel_i = i - a_samples
            amp = 1.0 - (1.0 - sustain_level) * (rel_i / d_samples)
        elif i < a_samples + d_samples + s_samples:
            amp = sustain_level
        else:
            rel_i = i - (a_samples + d_samples + s_samples)
            if r_samples > 0:
                amp = sustain_level * (1.0 - rel_i / r_samples)
            else:
                amp = 0.0
        output.append(val * amp * VOLUME)
    return output

def mix(track1, track2):
    """Mixes two tracks."""
    n = max(len(track1), len(track2))
    out = []
    for i in range(n):
        v1 = track1[i] if i < len(track1) else 0
        v2 = track2[i] if i < len(track2) else 0
        out.append(v1 + v2)
    return out

# --- SFX Generators ---

def gen_click():
    # Short high pitch sine with fast decay
    data = generate_sine(2000, 0.05) # High click
    # Apply simple decay
    return apply_envelope(data, 0.001, 0.04, 0, 0.009)

def gen_tick():
    # Woodblock style: 800Hz sine, very short
    data = generate_sine(800, 0.05)
    return apply_envelope(data, 0.001, 0.04, 0, 0)

def gen_correct():
    # Major triad arpeggio: C5, E5, G5
    # C5 = 523.25, E5 = 659.25, G5 = 783.99
    note1 = apply_envelope(generate_sine(523.25, 0.15), 0.01, 0.1, 0, 0.04)
    note2 = apply_envelope(generate_sine(659.25, 0.15), 0.01, 0.1, 0, 0.04)
    note3 = apply_envelope(generate_sine(783.99, 0.4), 0.01, 0.3, 0, 0.09)
    
    # Concatenate with slight overlap? No, just sequential for simplicity
    # But let's make them overlap slightly for "ding-dong" effect
    # Simple sequence
    return note1 + note2 + note3

def gen_wrong():
    # Low saw wave, dissonant
    data = generate_sawtooth(150, 0.4)
    return apply_envelope(data, 0.05, 0.2, 0.5, 0.15)

def gen_shuffle():
    # White noise bursts
    noise = generate_noise(0.1)
    env = apply_envelope(noise, 0.02, 0.08, 0, 0)
    # 3 shuffles
    return env + [0]*1000 + env + [0]*1000 + env

def gen_popup():
    # Slide up sine
    # Custom freq sweep
    duration = 0.2
    n_samples = int(SAMPLE_RATE * duration)
    data = []
    for i in range(n_samples):
        t = i / SAMPLE_RATE
        # Freq from 400 to 800
        freq = 400 + (400 * (t/duration))
        data.append(math.sin(2 * math.pi * freq * t))
    return apply_envelope(data, 0.01, 0.1, 1.0, 0.09)

def gen_star():
    # High twinkling
    # C7, E7
    # C7 = 2093, E7 = 2637
    note1 = apply_envelope(generate_sine(2093, 0.1), 0.01, 0.09, 0, 0)
    note2 = apply_envelope(generate_sine(2637, 0.2), 0.01, 0.19, 0, 0)
    return note1 + note2

def gen_match_found():
    # Pleasant chime/alert for finding a word
    # Ascending major triad with soft attack
    # C6 (1046.5), E6 (1318.5), G6 (1567.98)
    note1 = apply_envelope(generate_sine(1046.5, 0.1), 0.02, 0.08, 0, 0)
    note2 = apply_envelope(generate_sine(1318.5, 0.1), 0.02, 0.08, 0, 0)
    note3 = apply_envelope(generate_sine(1567.98, 0.3), 0.02, 0.2, 0, 0.05)
    return note1 + note2 + note3

def gen_word_clear():
    # Satisfying "poof" or "clear" sound
    # Slide up + noise burst
    # Sine slide 400 -> 800
    duration = 0.25
    slide = []
    for i in range(int(SAMPLE_RATE * duration)):
        t = i / SAMPLE_RATE
        freq = 400 + 400 * (t / duration)
        slide.append(math.sin(2 * math.pi * freq * t))
    slide = apply_envelope(slide, 0.01, 0.1, 0.5, 0.1)
    
    noise = generate_noise(duration)
    noise = apply_envelope(noise, 0.01, 0.05, 0.2, 0.1)
    
    return mix(slide, noise)

def gen_game_over():
    # Descending tones
    note1 = apply_envelope(generate_sine(880, 0.3), 0.01, 0.2, 0.5, 0.09)
    note2 = apply_envelope(generate_sine(830, 0.3), 0.01, 0.2, 0.5, 0.09) # Flat
    note3 = apply_envelope(generate_sine(440, 0.6), 0.01, 0.5, 0, 0.09)
    return note1 + note2 + note3

def gen_music_loop():
    # Simple 4-bar loop. C Major.
    # 120 BPM -> 0.5s per beat.
    # Bass: C3 (130.81), G2 (98.00), A2 (110.00), F2 (87.31)
    # Melody: simple sine
    
    beat_dur = 0.5
    bar_dur = 2.0 # 4 beats
    
    track_bass = []
    track_melody = []
    
    # Bar 1: C Major
    track_bass += apply_envelope(generate_sine(130.81, bar_dur), 0.1, 1.0, 0.5, 0.9)
    # Melody: E5, G5, C6, G5
    track_melody += apply_envelope(generate_sine(659.25, beat_dur), 0.01, 0.4, 0, 0.09)
    track_melody += apply_envelope(generate_sine(783.99, beat_dur), 0.01, 0.4, 0, 0.09)
    track_melody += apply_envelope(generate_sine(1046.5, beat_dur), 0.01, 0.4, 0, 0.09)
    track_melody += apply_envelope(generate_sine(783.99, beat_dur), 0.01, 0.4, 0, 0.09)

    # Bar 2: G Major
    track_bass += apply_envelope(generate_sine(98.00, bar_dur), 0.1, 1.0, 0.5, 0.9)
    track_melody += apply_envelope(generate_sine(587.33, beat_dur), 0.01, 0.4, 0, 0.09) # D5
    track_melody += apply_envelope(generate_sine(783.99, beat_dur), 0.01, 0.4, 0, 0.09) # G5
    track_melody += apply_envelope(generate_sine(987.77, beat_dur), 0.01, 0.4, 0, 0.09) # B5
    track_melody += apply_envelope(generate_sine(783.99, beat_dur), 0.01, 0.4, 0, 0.09)

    # Bar 3: A Minor
    track_bass += apply_envelope(generate_sine(110.00, bar_dur), 0.1, 1.0, 0.5, 0.9)
    track_melody += apply_envelope(generate_sine(523.25, beat_dur), 0.01, 0.4, 0, 0.09) # C5
    track_melody += apply_envelope(generate_sine(659.25, beat_dur), 0.01, 0.4, 0, 0.09) # E5
    track_melody += apply_envelope(generate_sine(880.00, beat_dur), 0.01, 0.4, 0, 0.09) # A5
    track_melody += apply_envelope(generate_sine(659.25, beat_dur), 0.01, 0.4, 0, 0.09)

    # Bar 4: F Major
    track_bass += apply_envelope(generate_sine(87.31, bar_dur), 0.1, 1.0, 0.5, 0.9)
    track_melody += apply_envelope(generate_sine(523.25, beat_dur), 0.01, 0.4, 0, 0.09) # C5
    track_melody += apply_envelope(generate_sine(698.46, beat_dur), 0.01, 0.4, 0, 0.09) # F5
    track_melody += apply_envelope(generate_sine(880.00, beat_dur), 0.01, 0.4, 0, 0.09) # A5
    track_melody += apply_envelope(generate_sine(698.46, beat_dur), 0.01, 0.4, 0, 0.09)

    return mix(track_bass, track_melody)

def main():
    # Paths
    base_path = "src/cocos/assets/resources/audio"
    music_path = os.path.join(base_path, "music")
    sfx_path = os.path.join(base_path, "sfx")
    
    # Generate SFX
    save_wav(os.path.join(sfx_path, "click.wav"), gen_click())
    save_wav(os.path.join(sfx_path, "tick.wav"), gen_tick())
    save_wav(os.path.join(sfx_path, "correct.wav"), gen_correct())
    save_wav(os.path.join(sfx_path, "wrong.wav"), gen_wrong())
    save_wav(os.path.join(sfx_path, "shuffle.wav"), gen_shuffle())
    save_wav(os.path.join(sfx_path, "popup.wav"), gen_popup())
    save_wav(os.path.join(sfx_path, "star.wav"), gen_star())
    save_wav(os.path.join(sfx_path, "match_found.wav"), gen_match_found())
    save_wav(os.path.join(sfx_path, "word_clear.wav"), gen_word_clear())
    save_wav(os.path.join(sfx_path, "game_over.wav"), gen_game_over())
    
    # Generate Music
    save_wav(os.path.join(music_path, "background.wav"), gen_music_loop())

if __name__ == "__main__":
    main()

