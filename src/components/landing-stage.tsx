"use client";
import { useState } from "react";
import {
  CloudDrizzle,
  CloudLightning,
  ShieldCheck,
  VolumeX,
} from "lucide-react";
import { TheaterPoster } from "./theater-poster";

export function LandingStage() {
  const [weather, setWeather] = useState<"gentle" | "wild">("gentle");
  return (
    <div className="landing-stage-wrap">
      <div className="theater-ticket">
        <span className="ticket-star" aria-hidden="true">
          ✦
        </span>
        <div>
          <span className="eyebrow">NOW REHEARSING</span>
          <strong>Borrowed Weather</strong>
        </div>
        <span className="ticket-number">EP. 001</span>
      </div>
      <div className={`landing-stage stage-weather-${weather}`}>
        <TheaterPoster weather={weather} />
        <div className="poster-rehearsal-label">
          <ShieldCheck size={14} aria-hidden="true" /> Illustrated rehearsal ·
          no live cameras
        </div>
        <div className="poster-corner">
          <VolumeX size={15} aria-hidden="true" /> A little preview of the
          possible
        </div>
        <div className="poster-caption">
          <span className="poster-caption-label">
            THE AUDIENCE SETS THE SCENE
          </span>
          <span>What kind of storm shall we borrow?</span>
          <div
            className="weather-toggle"
            role="group"
            aria-label="Preview illustrated weather"
          >
            <button
              onClick={() => setWeather("gentle")}
              aria-pressed={weather === "gentle"}
            >
              <CloudDrizzle size={17} aria-hidden="true" /> Gentle rain
            </button>
            <button
              onClick={() => setWeather("wild")}
              aria-pressed={weather === "wild"}
            >
              <CloudLightning size={17} aria-hidden="true" /> A little wild
            </button>
          </div>
        </div>
      </div>
      <div className="stage-footnote">
        <span>
          <span className="tiny-star" aria-hidden="true">
            ✦
          </span>{" "}
          A virtual umbrella. A very real connection.
        </span>
        <span>
          Original scene illustration · Try the working rehearsal inside ↗
        </span>
      </div>
    </div>
  );
}
