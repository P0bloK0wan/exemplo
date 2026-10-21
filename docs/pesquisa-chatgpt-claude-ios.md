# Pesquisa documental — apps iOS do ChatGPT e do Claude

> **Natureza desta pesquisa:** análise exclusivamente de *metadados* — nomes de
> arquivos, caminhos internos e tamanhos — extraídos de relatórios de listagem
> gerados pelo WinRAR sobre dois pacotes `.ipa` (apps compilados da App Store,
> decriptados). **Nenhum binário foi executado, nenhuma proteção foi
> contornada, nenhum recurso interno foi extraído, copiado ou reutilizado.**
> O objetivo é puramente de aprendizado arquitetural, para informar decisões
> *originais* de design do Kliko — nada aqui foi incorporado ao código do
> Kliko.
>
> Convenção usada abaixo: **[Verificado]** = aparece literalmente na listagem.
> **[Hipótese]** = interpretação minha sobre o que aquele nome/caminho
> provavelmente significa, sem confirmação de conteúdo real.

## 1. Natureza dos arquivos analisados

**[Verificado]** Ambos os relatórios (`ChatGPT.zip`, `Claude.zip`) começam com
`META-INF/com.apple.ZipMetadata.plist` e `META-INF/com.apple.FixedZipMetadata.bin`,
seguidos de `Payload/<Nome>.app/...`. Essa é a assinatura estrutural de um
pacote `.ipa` iOS decriptado — ou seja, **não são exportações de dados do
usuário**, são os próprios aplicativos compilados.

- `Payload/ChatGPT.app/ChatGPT` — binário executável, 358.416 bytes.
- `Payload/Claude.app/Claude` — binário executável, 118.513.568 bytes (~108,7 MB comprimidos no zip).

## 2. Frameworks identificados

**[Verificado]** — nomes de pastas `.framework` listados tal como aparecem.

| App | Frameworks encontrados |
|---|---|
| ChatGPT | `ChatGPT.framework`, `ChatGPTFinanceExperianImplementation.framework`, `ExperianIDVerifySDK.framework`, `LinkKit.framework`, `LiveKitWebRTC.framework`, `Lottie.framework`, `OpenAIXPlat.framework` |
| Claude | `LinkKit.framework`, `Sentry.framework` |

**[Hipótese]** A presença de `LiveKitWebRTC.framework` no ChatGPT sugere que o
modo de voz em tempo real deles usa WebRTC via LiveKit (ou um fork próprio) —
mas isso é inferência a partir do nome, não confirmação do protocolo real
usado. `ExperianIDVerifySDK`/`ChatGPTFinanceExperianImplementation` sugerem
verificação de identidade para alguma feature financeira, sem relação com
voz/fotos. `Sentry.framework` no Claude é só telemetria de erros (uso comum
em qualquer app). O Claude não referenciar `Lottie` **não prova** que eles não
usam animação vetorial — só que, se usam, não é essa biblioteca especificamente
(ou ela está embutida de outro jeito não identificável pelo nome da pasta).

## 3. Áudio — a pergunta central sobre "vozes"

**[Verificado]** Nenhum arquivo de áudio em nenhum dos dois relatórios se
parece com uma gravação de fala ou um modelo de síntese de voz. Todos os
arquivos de áudio encontrados são efeitos sonoros curtos de interface:

| App | Caminho | Arquivos (nomes literais) |
|---|---|---|
| ChatGPT | `.../ChatGPTVoice_ChatGPTVoiceAudio.bundle/` | `listeningStart.caf`, `elicitationDenial.caf`, `elicitationApproval.caf`, `elicitationQuestion.caf`, `buttonUpOn.caf`, `buttonUpOff.caf`, `buttonDown.caf`, `startUpdated.caf`, `resumeUpdated.caf`, `pauseUpdated.caf`, `endUpdated.caf`, `errorUpdated.caf`, `error.caf`, `hangUp.caf` |
| ChatGPT | `.../TibroCore_TibroCore.bundle/` | `orbit-ringing.wav` |
| Claude | `.../ClaudePackage_ClaudeVoice.bundle/` | `toolApprovalNeeded.caf`, `disconnected.caf`, `reconnecting.caf`, `reconnected.caf`, `processing.caf`, `exit.caf`, `enter.caf` |

**[Verificado + hipótese razoável]** Isso é consistente com algo que já era
esperado tecnicamente: motores de texto-para-voz (TTS) de produção **não
distribuem o modelo de voz dentro do app** — a síntese roda no servidor e o
áudio chega por streaming. Os `.caf`/`.wav` encontrados são só bips de UI
(início de escuta, erro, chamada encerrada, reconectando) — não há nenhuma
"voz do Kliko/ChatGPT/Claude" para extrair aqui, mesmo que eu quisesse.

**[Hipótese]** `orbit-ringing.wav` + a pasta `OrbitCharacters_OrbitCharacters.bundle`
sugerem que o modo de voz do ChatGPT usa uma metáfora visual de "orbe" — o que
*valida*, sem influenciar, a escolha já feita independentemente para a Mini
Kliko (também um orbe/nuvem azul). Nenhum código ou asset visual foi olhado,
só o nome da pasta.

## 4. Organização modular — o que os nomes de pastas revelam

**[Verificado]** No Claude, os bundles de voz estão separados por
responsabilidade, pelo nome:

- `ClaudePackage_ClaudeSpeechInput.bundle`
- `ClaudePackage_ClaudeTTS.bundle`
- `ClaudePackage_ClaudeVoice.bundle`
- `ClaudePackage_ClaudeVoiceUI.bundle`
- `ClaudePackage_ClaudeTranscriptUI.bundle`

**[Hipótese]** Essa nomenclatura sugere separação entre captura de fala, síntese
de voz, UI do modo de voz e UI de transcrição como módulos distintos — um
padrão comum de engenharia de software (separação de responsabilidades), não
uma técnica proprietária. Não sei o que há *dentro* de cada bundle, só que
existem como unidades nomeadas separadamente.

**[Verificado]** Outros bundles relevantes encontrados por nome:
`ChatGPTMemory_ChatGPTMemory.bundle`, `ChatGPTAudioAttachments_*`,
`ClaudeDesignSystem_ClaudeIcons.bundle`, `ClaudeFonts_ClaudeFonts.bundle`,
`HomeChatPackage_HomeChat{Backend,Cards,Engine,Entry,Page,Shell}.bundle`, além
de diversos SDKs de terceiros de uso comum (AppAuth, Datadog, Firebase, GRDB,
GoogleSignIn, KSCrash, Kingfisher, PhoneNumberKit, SwiftProtobuf, nanopb) —
nenhum desses tem relação com voz ou edição de foto; são infraestrutura padrão
de app (autenticação, crash reporting, cache de imagem, etc.).

**[Verificado]** 23 entradas de `Assets.car` no relatório do Claude — são
catálogos de assets compilados do Xcode, não revelam nada de arquitetura.

## 5. O que isso informa sobre o Kliko — conhecimento geral, não cópia

1. A separação entrada-de-voz / síntese / UI-de-voz / UI-de-transcrição que o
   nome dos bundles do Claude sugere é exatamente o padrão que o Kliko já
   segue por design próprio: `src/engine/voiceEngine.ts` (síntese) separado de
   `src/components/MiniKliko.tsx` (orquestração) e `VoicePicker.tsx` (UI) —
   escrito do zero, sem olhar código real deles.
2. `LiveKitWebRTC.framework` confirma que WebRTC/LiveKit é uma tecnologia real
   usada em produção para voz em tempo real — reforça que, se o Kliko migrar
   para conversação por voz em tempo real (ver §6 da reavaliação de
   tecnologias), avaliar LiveKit oficialmente é uma pista legítima de
   pesquisa, não porque "o ChatGPT usa", mas porque é uma tecnologia aberta
   (Apache 2.0) com SDK de navegador.
3. `Lottie.framework` no ChatGPT confirma que animação vetorial via JSON é
   usada em produção em apps desse porte — vale considerar para parte do
   catálogo de 120 animações do Kliko, novamente pela biblioteca open-source
   em si (`lottie-web`, MIT), não por extração.

## 6. O que NUNCA deve ser reutilizado — e por quê

- **Os binários executáveis dos apps** (`ChatGPT`, `Claude`) — software
  compilado proprietário, sem licença de redistribuição ou modificação.
- **Os arquivos `.caf`/`.wav` específicos listados acima** — são ativos
  (assets) dos aplicativos, protegidos por direitos de autor, mesmo sendo só
  bipes curtos de interface.
- **Qualquer `Assets.car` ou recurso visual compilado** de dentro desses
  pacotes.
- **Qualquer arquivo de animação Lottie (`.json`) que eventualmente exista
  dentro do bundle `Lottie.framework` do ChatGPT** — diferente da *biblioteca*
  Lottie (que é open-source e pode ser adotada livremente via npm), um asset
  de animação específico embutido no app seria propriedade deles.
- Em nenhum momento o conteúdo real de nenhum arquivo foi aberto, extraído ou
  copiado — esta pesquisa ficou estritamente nos nomes e caminhos já visíveis
  nos relatórios de listagem fornecidos.

## 7. Conclusão

Não existe, em nenhum dos dois relatórios, nenhuma "voz" (gravação ou modelo)
para extrair — isso elimina de vez a hipótese de reaproveitar algo de voz
proprietário dessas fontes. O valor real desta pesquisa foi confirmar padrões
arquiteturais genéricos (separação modular de um pipeline de voz, uso de
WebRTC e de animação vetorial em produtos desse porte) que servem como
validação de direção, não como fonte de código ou assets.
