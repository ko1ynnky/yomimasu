# hook と CI の検査が共有する一覧。音声の拡張子と鍵の形は、ここだけで変える。
# 拡張子を足すときは .gitignore にも足す。食い違いは guard-files.test.sh が止める。

audio_extensions=(wav wave mp3 m4a aac flac ogg oga opus aif aiff caf wma weba webm mp4 mov)
audio_ext="\.($(IFS='|' && printf '%s' "${audio_extensions[*]}"))$"

key_file='(^|/)(\.env(\.[^/]*)?|\.dev\.vars(\.[^/]*)?|[^/]*\.(pem|key|p12|pfx)|id_rsa|id_ed25519|secrets/.*)$'
key_sample='\.(example|sample)$'
secret="sk-ant-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(KEY|TOKEN|SECRET)[A-Z_]*[\"']?[[:space:]]*[:=][[:space:]]*[\"']?[A-Za-z0-9_-]{32,}"
