use app_state::{build_app_state, resolve_persisted_identity, AppState};
use builderlab::*;
use commands::*;
use deep_link::{
    acknowledge_pending_community_deep_link, acknowledge_pending_entity_deep_link,
    acknowledge_pending_navigation_deep_link, clear_pending_navigation_deep_links,
    handle_deep_link_url, take_pending_community_deep_link, take_pending_entity_deep_link,
    take_pending_navigation_deep_link, PendingCommunityDeepLinks, PendingEntityDeepLinks,
    PendingNavigationDeepLinks,
};
use huddle::audio_output::{
    get_audio_output_device, list_audio_output_devices, set_audio_output_device,
};
use huddle::reconnect::reconnect_huddle_audio;
use huddle::{
    add_agent_to_huddle, check_pipeline_hotstart, close_huddle_companion, confirm_huddle_active,
    download_voice_models, end_huddle, get_huddle_agent_pubkeys, get_huddle_state,
    get_model_status, get_voice_input_mode, interrupt_huddle_speech, join_huddle, leave_huddle,
    open_huddle_window, push_audio_pcm, remove_agent_from_huddle, set_huddle_manual_mic_unmuted,
    set_huddle_transcription_enabled, set_tts_enabled, set_voice_input_mode, speak_agent_message,
    start_huddle, start_stt_pipeline, HuddlePhase,
};
use initial_window::*;
use managed_agents::{
    backfill_persona_snapshots, ensure_nest, list_managed_agent_runtimes,
    put_managed_agent_runtime_lifecycle, reconcile_managed_agent_runtimes,
    restart_managed_agent_runtime, start_managed_agent_runtime, stop_managed_agent_runtime,
    try_regenerate_nest,
};
#[cfg(not(feature = "mesh-llm"))]
use mesh_llm_stubs::*;
#[cfg(all(feature = "mesh-llm", target_os = "macos"))]
use shutdown::{hard_exit_after_mesh_shutdown, relaunch_after_mesh_shutdown};
use shutdown::{is_restart_request, shut_down_app};
use std::sync::{atomic::AtomicBool, atomic::Ordering, Arc};
#[cfg(target_os = "macos")]
use tauri::Listener;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_window_state::StateFlags;
#[cfg(target_os = "macos")]
use tray_menu::show_main_window;
