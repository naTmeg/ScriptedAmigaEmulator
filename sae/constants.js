/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/

const SAEV_Version = 0;
const SAEV_Revision = 8;
const SAEV_Revision_Sub = 1;

/*-----------------------------------------------------------------------*/
/* info */

const SAEI_Audio_Default = 1;
const SAEI_Audio_Webkit = 2;
const SAEI_Audio_Mozilla = 4;

const SAEI_Video_Canvas2D = 1;
const SAEI_Video_WebGL = 2;

/*-----------------------------------------------------------------------*/
/* cpu */

const SAEV_Config_CPU_Speed_Maximum = -1;
const SAEV_Config_CPU_Speed_Original = 0;

/*-----------------------------------------------------------------------*/
/* chipset */

const SAEV_Config_Chipset_Type_OCS = 1;
const SAEV_Config_Chipset_Type_ECS_AGNUS = 2;
const SAEV_Config_Chipset_Type_ECS_DENISE = 3;

const SAEV_Config_Chipset_Mask_OCS = 0;
const SAEV_Config_Chipset_Mask_ECS_AGNUS = 1;
const SAEV_Config_Chipset_Mask_ECS_DENISE = 1 | 2;


const SAEV_Config_Chipset_ColLevel_None = 0;
const SAEV_Config_Chipset_ColLevel_Sprite_Sprite = 1;
const SAEV_Config_Chipset_ColLevel_Sprite_Playfield = 2;
const SAEV_Config_Chipset_ColLevel_Full = 3;

/*-----------------------------------------------------------------------*/
/* ram */

const SAEV_Config_RAM_Chip_Size_256K = 1;
const SAEV_Config_RAM_Chip_Size_512K = 2;
const SAEV_Config_RAM_Chip_Size_1M = 3;
const SAEV_Config_RAM_Chip_Size_2M = 4;

const SAEV_Config_RAM_Slow_Size_None = 0;
const SAEV_Config_RAM_Slow_Size_256K = 1;
const SAEV_Config_RAM_Slow_Size_512K = 2;
const SAEV_Config_RAM_Slow_Size_1M = 3;
const SAEV_Config_RAM_Slow_Size_1536K = 4;

const SAEV_Config_RAM_Fast_Size_None = 0;
const SAEV_Config_RAM_Fast_Size_512K = 1;
const SAEV_Config_RAM_Fast_Size_1M = 2;
const SAEV_Config_RAM_Fast_Size_2M = 3;
const SAEV_Config_RAM_Fast_Size_4M = 4;
const SAEV_Config_RAM_Fast_Size_8M = 5;

/*-----------------------------------------------------------------------*/
/* rom, ext */

const SAEV_Config_ROM_Size_None = 0;
const SAEV_Config_ROM_Size_256K = 1;
const SAEV_Config_ROM_Size_512K = 2;

const SAEV_Config_EXT_Size_None = 0;
const SAEV_Config_EXT_Size_256K = 1;
const SAEV_Config_EXT_Size_512K = 2;

//const SAEV_Config_EXT_Addr_A0 = 1;
const SAEV_Config_EXT_Addr_E0 = 2;
const SAEV_Config_EXT_Addr_F0 = 3;

/*-----------------------------------------------------------------------*/
/* disk */

const SAEV_Config_Floppy_Type_None = 0;
const SAEV_Config_Floppy_Type_35_DD = 1;
const SAEV_Config_Floppy_Type_35_HD = 2;
const SAEV_Config_Floppy_Type_525_SD = 3;

const SAEV_Config_Floppy_Speed_Turbo = 0;
const SAEV_Config_Floppy_Speed_Original = 100;

/*-----------------------------------------------------------------------*/
/* audio */

const SAEV_Config_Audio_Mode_Emul = 0;
const SAEV_Config_Audio_Mode_Play = 1;
const SAEV_Config_Audio_Mode_Play_Best = 2;

const SAEV_Config_Audio_Channels_Mono = 1;
const SAEV_Config_Audio_Channels_Stereo = 2;

const SAEV_Config_Audio_Rate_11025 = 1;
const SAEV_Config_Audio_Rate_22050 = 2;
const SAEV_Config_Audio_Rate_44100 = 3;
const SAEV_Config_Audio_Rate_48000 = 4;

/*-----------------------------------------------------------------------*/
/* input */

const SAEV_Config_Ports_Type_None = 0;
const SAEV_Config_Ports_Type_Mouse = 1;
const SAEV_Config_Ports_Type_Joy0 = 2;
const SAEV_Config_Ports_Type_Joy1 = 3;

const SAEV_Config_Ports_Move_None = 0;
const SAEV_Config_Ports_Move_Arrows = 1;
const SAEV_Config_Ports_Move_Numpad = 2;
const SAEV_Config_Ports_Move_WASD = 3;

const SAEV_Config_Ports_Fire_None = 0;

/*-----------------------------------------------------------------------*/
/* rtc */

const SAEV_Config_RTC_Type_None = 0;
const SAEV_Config_RTC_Type_MSM6242B = 1;
const SAEV_Config_RTC_Type_RF5C01A = 2;

/*-----------------------------------------------------------------------*/
/* erros */

//const SAEE_None = 0;

const SAEE_CPU_Internal = 1;
const SAEE_CPU_68020_Required = 2;

const SAEE_Disk_File_Too_Big = 3;

const SAEE_Video_Shader_Error = 4;
const SAEE_Video_ID_Not_Found = 5;
const SAEE_Video_Canvas_Not_Supported = 6;
//const SAEE_Video_WebGL_Not_Avail = 7;

const SAEE_Audio_WebAudio_Not_Avail = 8;

/*-----------------------------------------------------------------------*/
/* methods */

/*const SAEM_Init = 1;
const SAEM_Start = 2;
const SAEM_Stop = 3;
const SAEM_Pause = 4;
const SAEM_Reset = 5;
const SAEM_Insert = 6;
const SAEM_Eject = 7;*/

/*-----------------------------------------------------------------------*/
/*-----------------------------------------------------------------------*/
/* amiga */

const ST_STOP  = 0;
const ST_CYCLE = 1;
const ST_PAUSE = 2;
const ST_IDLE  = 3;

/*-----------------------------------------------------------------------*/
/* events */

const EV_CIA     = 0;
const EV_AUDIO   = 1;
const EV_MISC    = 2;
const EV_HSYNC   = 3;
const EV_MAX     = 4;

const EV2_BLITTER = 0;
const EV2_DISK    = 1;
const EV2_DMAL    = 2;
const EV2_MISC    = 3;
const EV2_MAX     = 3 + 10;

const CYCLE_UNIT = 512;
const CYCLE_UNIT_INV = 1.0 / CYCLE_UNIT; /* mul is always faster than div */

const CYCLE_MAX = 0xffffffff * CYCLE_UNIT;

/*-----------------------------------------------------------------------*/
/* cpu */

const SPCFLAG_STOP = 2;
const SPCFLAG_COPPER = 4;
const SPCFLAG_INT = 8;
//const SPCFLAG_BRK = 16;
const SPCFLAG_TRACE = 64;
const SPCFLAG_DOTRACE = 128;
const SPCFLAG_DOINT = 256; 
const SPCFLAG_BLTNASTY = 512;
const SPCFLAG_TRAP = 1024;

/*-----------------------------------------------------------------------*/
/* amiga */

const INTF_TBE		= 1 << 0;
const INTF_DSKBLK	= 1 << 1;
const INTF_PORTS	= 1 << 3;
const INTF_COPER	= 1 << 4;
const INTF_VERTB	= 1 << 5;
const INTF_BLIT	= 1 << 6;
const INTF_AUD0	= 1 << 7;
const INTF_AUD1	= 1 << 8;
const INTF_AUD2	= 1 << 9;
const INTF_AUD3	= 1 << 10;
const INTF_RBF		= 1 << 11;
const INTF_DSKSYN	= 1 << 12;
const INTF_EXTER	= 1 << 13;
const INTF_INTEN	= 1 << 14;
const INTF_SETCLR	= 1 << 15;

const INT_DSKBLK	= INTF_SETCLR | INTF_DSKBLK;
const INT_VERTB	= INTF_SETCLR | INTF_VERTB;
const INT_BLIT		= INTF_SETCLR | INTF_BLIT;
const INT_DSKSYN	= INTF_SETCLR | INTF_DSKSYN;

const DMAF_AUD0EN	= 1 << 0;
const DMAF_AUD1EN	= 1 << 1;
const DMAF_AUD2EN	= 1 << 2;
const DMAF_AUD3EN	= 1 << 3;
const DMAF_DSKEN	= 1 << 4;
const DMAF_SPREN	= 1 << 5;
const DMAF_BLTEN	= 1 << 6;
const DMAF_COPEN	= 1 << 7;
const DMAF_BPLEN	= 1 << 8;
const DMAF_DMAEN	= 1 << 9;
const DMAF_BLTPRI	= 1 << 10;
const DMAF_BZERO	= 1 << 13;
const DMAF_BBUSY	= 1 << 14;
const DMAF_SETCLR	= 1 << 15;

/*-----------------------------------------------------------------------*/
/* blitter  */

const BLT_done = 0;
const BLT_init = 1;
const BLT_read = 2;
const BLT_work = 3;
const BLT_write = 4;
const BLT_next = 5;

/*-----------------------------------------------------------------------*/
/* video  */

const VIDEO_WIDTH = 720; /* == 360*2 */
const VIDEO_HEIGHT = 568; /* == 284*2 */
const VIDEO_DEPTH = 32; 

/*-----------------------------------------------------------------------*/
/* audio */

const PERIOD_MIN = 4;
const PERIOD_MIN_NONCE = 60;
const PERIOD_MAX = 0xffffffff * CYCLE_UNIT;

/*-----------------------------------------------------------------------*/
/* playfield, sprites */

const CUSTOM_SIMPLE = 0;
const SMART_UPDATE = 0;

const MAXHPOS = 227;
const MAXHPOS_PAL = 227;
const MAXHPOS_NTSC = 227;
const MAXVPOS = 312;
const MAXVPOS_PAL = 312;
const MAXVPOS_NTSC = 262;
const VBLANK_ENDLINE_PAL = 26;
const VBLANK_ENDLINE_NTSC = 21;
const VBLANK_SPRITE_PAL = 25;
const VBLANK_SPRITE_NTSC = 20;
const VBLANK_HZ_PAL = 50;
const VBLANK_HZ_NTSC = 60;
const EQU_ENDLINE_PAL = 8;
const EQU_ENDLINE_NTSC = 10;

const CSMASK_ECS_AGNUS = 1;
const CSMASK_ECS_DENISE = 2;
const CSMASK_AGA = 4;
//const CSMASK_MASK = (CSMASK_ECS_AGNUS | CSMASK_ECS_DENISE | CSMASK_AGA);

const CHIPSET_CLOCK_PAL  = 3546895;
const CHIPSET_CLOCK_NTSC = 3579545;

const RES_LORES		= 0;
const RES_HIRES		= 1;
const RES_SUPERHIRES	= 2;
const RES_MAX			= 2;

const VRES_NONDOUBLE	= 0;
const VRES_DOUBLE		= 1;
const VRES_QUAD		= 2;
const VRES_MAX			= 1;

const DIW_WAITING_START	= 0;
const DIW_WAITING_STOP	= 1;

const LINE_UNDECIDED						= 1;
const LINE_DECIDED						= 2;
const LINE_DECIDED_DOUBLE				= 3;
const LINE_AS_PREVIOUS					= 4;
const LINE_BLACK							= 5;
const LINE_REMEMBERED_AS_BLACK		= 6;
const LINE_DONE							= 7;
const LINE_DONE_AS_PREVIOUS			= 8;
const LINE_REMEMBERED_AS_PREVIOUS	= 9;

const LOF_TOGGLES_NEEDED = 4;
const NLACE_CNT_NEEDED = 50;

const HARD_DDF_STOP = 0xd4;
const HARD_DDF_START = 0x18;

const MAX_PLANES = 6; /* 8 = AGA */

const AMIGA_WIDTH_MAX = 752 / 2;
//const AMIGA_HEIGHT_MAX = 574 / 2;

const DIW_DDF_OFFSET = 1;
const HBLANK_OFFSET = 9;
const DISPLAY_LEFT_SHIFT = 0x38;

const NLN_NORMAL	= 0;
const NLN_DOUBLED	= 1;
const NLN_UPPER	= 2;
const NLN_LOWER	= 3;
const NLN_NBLACK	= 4;

const PLF_IDLE				= 0;
const PLF_START			= 1;
const PLF_ACTIVE			= 2;
const PLF_PASSED_STOP	= 3;
const PLF_PASSED_STOP2	= 4;
const PLF_END				= 5;

const FETCH_NOT_STARTED	= 0;
const FETCH_STARTED		= 1;
const FETCH_WAS_PLANE0	= 2;

const COLOR_TABLE_SIZE = (MAXVPOS + 2) * 2;  
const COLOR_CHANGE_BRDBLANK = 0x80000000;

const BPLCON_DENISE_DELAY = 1;

//const SPRITE_DEBUG = 0;
//const SPRITE_DEBUG_MINY = 0x0;
//const SPRITE_DEBUG_MAXY = 0x100;
//const AUTOSCALE_SPRITES = 1;
//const SPRBORDER = 0;
const SPR0_HPOS = 0x15;
const MAX_SPRITES = 8;

const MAX_PIXELS_PER_LINE = 1760;

const MAX_SPR_PIXELS = (((MAXVPOS + 1) * 2 + 1) * MAX_PIXELS_PER_LINE);
const MAX_REG_CHANGE = ((MAXVPOS + 1) * 2 * MAXHPOS);

const MAX_STOP = 30000;
const NO_BLOCK = -3;

const MAX_WORDS_PER_LINE = 100;

const DO_SPRITES = 1;
const FAST_COLORS = 0;
