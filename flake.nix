{
  description = "Uriel - a desktop audio player (Electron)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    let
      mkUriel = pkgs:
        pkgs.buildNpmPackage rec {
          pname = "uriel";
          version = "42.0.0";
          src = self;

          npmDepsHash = "sha256-fptxs7GYEi3F9BTI6amByNVcX28QElIE6e0baFr4WzI=";

          ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
          forceGitDeps = true;
          npmInstallFlags = [ "--omit=dev" ];

          buildPhase = "true";

          installPhase =
            let
              appDir = "$out/share/uriel";
              runtimeDeps = pkgs.lib.makeBinPath [ pkgs.yt-dlp pkgs.ffmpeg ];
              desktop = pkgs.makeDesktopItem {
                name = "Uriel";
                desktopName = "Uriel";
                genericName = "Audio Player";
                exec = "uriel";
                icon = "uriel";
                categories = [ "AudioVideo" "Audio" "Player" ];
                startupWMClass = "uriel";
              };
            in
            ''
              runHook preInstall

              mkdir -p ${appDir}
              for f in *; do cp -r "$f" ${appDir}/; done

              mkdir -p $out/bin
              makeWrapper ${pkgs.electron}/bin/electron $out/bin/uriel \
                --add-flags ${appDir} \
                --prefix PATH : ${runtimeDeps}

              mkdir -p $out/share/applications
              cp ${desktop}/share/applications/*.desktop $out/share/applications/

              mkdir -p $out/share/icons/hicolor/256x256/apps
              cp ${appDir}/shared/assets/icon.png $out/share/icons/hicolor/256x256/apps/uriel.png

              runHook postInstall
            '';

          meta = with pkgs.lib; {
            description = "Uriel - audio player made for humans";
            homepage = "https://github.com/Esperant0s/Uriel";
            license = licenses.mit;
            mainProgram = "uriel";
            platforms = platforms.linux ++ platforms.darwin;
          };
        };
    in
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        packages = {
          default = mkUriel pkgs;
          uriel = mkUriel pkgs;
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs
            python3
            yt-dlp
            ffmpeg
          ];

          shellHook = ''
            echo "Uriel dev shell. Install deps and run with:"
            echo "  npm install && npm start"
          '';
        };
      })
    // {
      overlays.default = final: prev: {
        uriel = mkUriel final;
      };
    };
}
