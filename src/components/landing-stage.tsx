"use client";
import { useState } from "react";
import { CloudDrizzle, CloudLightning } from "lucide-react";
import { TheaterPoster } from "./theater-poster";

export function LandingStage() {
  const [weather, setWeather] = useState<"gentle" | "wild">("gentle");
  return (
    <div className="landing-stage-wrap">
      <div className={`landing-stage stage-weather-${weather}`}>
        <TheaterPoster weather={weather} showLabel={false} />
        <div className="poster-caption">
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
    </div>
  );
}
