# Real Twitch notification ID correction

On deployment `dpl_Tty6pbCz4qB7t724hxvRNuUkRKzZ`, the actual host-account `!gentle` message was sent successfully by Twitch but did not reach the weather tally. A second authorized `!rain` message was captured at the browser EventSub boundary. Its notification ID ended with `=`, while the new client projection accepted only alphanumeric, underscore and hyphen IDs. The browser received the notification but made no `/twitch/events` request. The subscription was independently confirmed enabled with the expected broadcaster/user condition.

[Sanitized captured event](production-twitch-discovery.json) preserves the actual shape. The weather choice explicitly used Director's choice after the missing ballot; it was not relabeled as audience input.

Runtime fix `5bf1112ea03e04fd46aa542b349aa7482c30acd2` accepts bounded opaque notification/message identifiers, including `=`, `/` and `+`, while retaining numeric account validation. Six regressions include the observed identifier and malformed/bounded cases. Validation: 24 focused Twitch tests, 367 full-suite tests passed, seven optional database tests skipped; typecheck, formatting, diff and optimized build passed. Build `N5kdWpGIpWTKr-x-fFsBi`. The reservation and Workflow code did not change.

After redeployment, real `!rain`, `!thunder`, and `!cheer` reached server presence events, and real `!accept`/`!giveback` decisions drove both handoffs. [Production verification](production-verification.md) records the successful path and a separate network interruption. These are public commands from the authorized host account, not a second independent audience member.
