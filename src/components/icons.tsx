/**
 * The app's icons, in one place: every file imports them from here, by the
 * names it has always used (IconSearch, IconLock...), so the set behind them
 * changes in this file alone. Phosphor's (@phosphor-icons/react, MIT), in
 * its regular weight, and its fill weight for a state that is on (a pin, a
 * star, a check); Tabler's stays where Phosphor has nothing near.
 */

import { forwardRef } from "react";
import type { Icon, IconProps } from "@tabler/icons-react";
import {
  Archive,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowLineDown,
  ArrowLineUp,
  ArrowRight,
  ArrowSquareOut,
  ArrowUUpLeft,
  ArrowUUpRight,
  ArrowUp,
  ArrowUpRight,
  ArrowsDownUp,
  ArrowsHorizontal,
  ArrowsIn,
  ArrowsOut,
  BezierCurve,
  Book,
  BookOpen,
  BookmarkSimple,
  Briefcase,
  Bug,
  Buildings,
  CalendarDots,
  CalendarSlash,
  Camera,
  Cards,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  CaretUpDown,
  Certificate,
  ChartBar,
  ChatCircle,
  ChatText,
  Check,
  CheckCircle,
  Checkerboard,
  Circle,
  CircleDashed,
  CircleHalf,
  Clipboard,
  Clock,
  ClockCounterClockwise,
  CloudArrowUp,
  Code,
  CodeBlock,
  CodeSimple,
  Columns,
  ColumnsPlusLeft,
  ColumnsPlusRight,
  Compass,
  Copy,
  CreditCard,
  Crosshair,
  DeviceMobile,
  DeviceTablet,
  DiscordLogo,
  DotsSixVertical,
  DotsThree,
  DownloadSimple,
  DribbbleLogo,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  Eyedropper,
  FigmaLogo,
  File,
  FileArrowUp,
  FileMagnifyingGlass,
  FilePdf,
  FileText,
  FileZip,
  FilmSlate,
  Flag,
  Folder,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  FolderSimple,
  Folders,
  Gauge,
  GearSix,
  GitBranch,
  GitCommit,
  GitDiff,
  GitFork,
  GitPullRequest,
  GithubLogo,
  GitlabLogo,
  Globe,
  GlobeHemisphereWest,
  GlobeSimple,
  GoogleLogo,
  Hash,
  Heart,
  Image,
  ImageBroken,
  ImageSquare,
  Info,
  InstagramLogo,
  Key,
  Keyboard,
  Leaf,
  Lightning,
  LinkSimple,
  LinkSimpleBreak,
  LinkedinLogo,
  List,
  ListBullets,
  ListChecks,
  ListNumbers,
  LockKey,
  LockSimple,
  MagnifyingGlass,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Megaphone,
  Minus,
  Monitor,
  Moon,
  MusicNotes,
  Note,
  OpenAiLogo,
  PaintBrush,
  PaintBucket,
  Palette,
  PaperPlaneRight,
  PaperPlaneTilt,
  Paragraph,
  Path,
  Pause,
  PencilSimple,
  PictureInPicture,
  Play,
  Plug,
  PlugsConnected,
  Plus,
  PlusCircle,
  Printer,
  Pulse,
  PushPin,
  PushPinSlash,
  Question,
  Quotes,
  Robot,
  RocketLaunch,
  Rows,
  RowsPlusBottom,
  RowsPlusTop,
  Scan,
  Scissors,
  SelectionBackground,
  Shapes,
  ShareNetwork,
  ShieldCheck,
  Sidebar,
  SidebarSimple,
  SignIn,
  SignOut,
  Sliders,
  SlidersHorizontal,
  Smiley,
  Sparkle,
  SquaresFour,
  Stack,
  Star,
  Storefront,
  Sun,
  Table,
  Tag,
  TagSimple,
  TerminalWindow,
  TextAa,
  TextAlignLeft,
  TextB,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextT,
  Textbox,
  ToggleLeft,
  Trash,
  Tray,
  TreeStructure,
  Triangle,
  Trophy,
  UploadSimple,
  User,
  UserCheck,
  UserFocus,
  UserPlus,
  Users,
  UsersThree,
  VideoCameraSlash,
  Warning,
  WarningCircle,
  WarningOctagon,
  X,
  XCircle,
  XLogo,
  YoutubeLogo,
} from "@phosphor-icons/react/ssr";
import type { IconWeight } from "@phosphor-icons/react";

export type { Icon, IconProps };

type Phosphor = React.ForwardRefExoticComponent<React.SVGProps<SVGSVGElement> & { size?: number | string; weight?: IconWeight } & React.RefAttributes<SVGSVGElement>>;

/** A Phosphor icon under a Tabler name: the same props (stroke is Tabler's alone) and ref. */
function ph(P: Phosphor, name: string, weight: IconWeight = "regular"): Icon {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const I = forwardRef<SVGSVGElement, IconProps>(function PhosphorIcon({ stroke, size, ...props }, ref) {
    return <P ref={ref} weight={weight} size={size ?? "1em"} {...(props as React.SVGProps<SVGSVGElement>)} />;
  });
  I.displayName = name;
  return I as unknown as Icon;
}

export const IconActivity = ph(Pulse as Phosphor, "IconActivity");
export const IconAdjustments = ph(Sliders as Phosphor, "IconAdjustments");
export const IconAdjustmentsHorizontal = ph(SlidersHorizontal as Phosphor, "IconAdjustmentsHorizontal");
export const IconAlertCircle = ph(WarningCircle as Phosphor, "IconAlertCircle");
export const IconAlertOctagon = ph(WarningOctagon as Phosphor, "IconAlertOctagon");
export const IconAlertTriangle = ph(Warning as Phosphor, "IconAlertTriangle");
export const IconAlignLeft = ph(TextAlignLeft as Phosphor, "IconAlignLeft");
export const IconApi = ph(PlugsConnected as Phosphor, "IconApi");
export const IconArchive = ph(Archive as Phosphor, "IconArchive");
export const IconArrowAutofitWidth = ph(ArrowsHorizontal as Phosphor, "IconArrowAutofitWidth");
export const IconArrowBackUp = ph(ArrowUUpLeft as Phosphor, "IconArrowBackUp");
export const IconArrowBarToDown = ph(ArrowLineDown as Phosphor, "IconArrowBarToDown");
export const IconArrowBarToUp = ph(ArrowLineUp as Phosphor, "IconArrowBarToUp");
export const IconArrowDown = ph(ArrowDown as Phosphor, "IconArrowDown");
export const IconArrowDownLeft = ph(ArrowDownLeft as Phosphor, "IconArrowDownLeft");
export const IconArrowDownRight = ph(ArrowDownRight as Phosphor, "IconArrowDownRight");
export const IconArrowForwardUp = ph(ArrowUUpRight as Phosphor, "IconArrowForwardUp");
export const IconArrowLeft = ph(ArrowLeft as Phosphor, "IconArrowLeft");
export const IconArrowRight = ph(ArrowRight as Phosphor, "IconArrowRight");
export const IconArrowUp = ph(ArrowUp as Phosphor, "IconArrowUp");
export const IconArrowUpRight = ph(ArrowUpRight as Phosphor, "IconArrowUpRight");
export const IconArrowsMaximize = ph(ArrowsOut as Phosphor, "IconArrowsMaximize");
export const IconArrowsMinimize = ph(ArrowsIn as Phosphor, "IconArrowsMinimize");
export const IconArrowsSort = ph(ArrowsDownUp as Phosphor, "IconArrowsSort");
export const IconBlockquote = ph(Quotes as Phosphor, "IconBlockquote");
export const IconBold = ph(TextB as Phosphor, "IconBold");
export const IconBolt = ph(Lightning as Phosphor, "IconBolt");
export const IconBook = ph(BookOpen as Phosphor, "IconBook");
export const IconBook2 = ph(Book as Phosphor, "IconBook2");
export const IconBookmark = ph(BookmarkSimple as Phosphor, "IconBookmark");
export const IconBrandDiscord = ph(DiscordLogo as Phosphor, "IconBrandDiscord");
export const IconBrandDribbble = ph(DribbbleLogo as Phosphor, "IconBrandDribbble");
export const IconBrandFigma = ph(FigmaLogo as Phosphor, "IconBrandFigma");
export const IconBrandGit = ph(GitBranch as Phosphor, "IconBrandGit");
export const IconBrandGithub = ph(GithubLogo as Phosphor, "IconBrandGithub");
export const IconBrandGitlab = ph(GitlabLogo as Phosphor, "IconBrandGitlab");
export const IconBrandGoogle = ph(GoogleLogo as Phosphor, "IconBrandGoogle");
export const IconBrandInstagram = ph(InstagramLogo as Phosphor, "IconBrandInstagram");
export const IconBrandLinkedin = ph(LinkedinLogo as Phosphor, "IconBrandLinkedin");
export const IconBrandOpenai = ph(OpenAiLogo as Phosphor, "IconBrandOpenai");
export const IconBrandVercel = ph(Triangle as Phosphor, "IconBrandVercel");
export const IconBrandVscode = ph(CodeSimple as Phosphor, "IconBrandVscode");
export const IconBrandX = ph(XLogo as Phosphor, "IconBrandX");
export const IconBrandYoutube = ph(YoutubeLogo as Phosphor, "IconBrandYoutube");
export const IconBriefcase = ph(Briefcase as Phosphor, "IconBriefcase");
export const IconBrush = ph(PaintBrush as Phosphor, "IconBrush");
export const IconBucketDroplet = ph(PaintBucket as Phosphor, "IconBucketDroplet");
export const IconBug = ph(Bug as Phosphor, "IconBug");
export const IconBuilding = ph(Buildings as Phosphor, "IconBuilding");
export const IconBuildingStore = ph(Storefront as Phosphor, "IconBuildingStore");
export const IconCalendarEvent = ph(CalendarDots as Phosphor, "IconCalendarEvent");
export const IconCalendarOff = ph(CalendarSlash as Phosphor, "IconCalendarOff");
export const IconCamera = ph(Camera as Phosphor, "IconCamera");
export const IconCertificate = ph(Certificate as Phosphor, "IconCertificate");
export const IconChartBar = ph(ChartBar as Phosphor, "IconChartBar");
export const IconCheck = ph(Check as Phosphor, "IconCheck");
export const IconChevronDown = ph(CaretDown as Phosphor, "IconChevronDown");
export const IconChevronLeft = ph(CaretLeft as Phosphor, "IconChevronLeft");
export const IconChevronRight = ph(CaretRight as Phosphor, "IconChevronRight");
export const IconChevronUp = ph(CaretUp as Phosphor, "IconChevronUp");
export const IconCircle = ph(Circle as Phosphor, "IconCircle");
export const IconCircleCheck = ph(CheckCircle as Phosphor, "IconCircleCheck");
export const IconCircleCheckFilled = ph(CheckCircle as Phosphor, "IconCircleCheckFilled", "fill");
export const IconCircleDashed = ph(CircleDashed as Phosphor, "IconCircleDashed");
export const IconCircleFilled = ph(Circle as Phosphor, "IconCircleFilled", "fill");
export const IconCirclePlus = ph(PlusCircle as Phosphor, "IconCirclePlus");
export const IconCircleX = ph(XCircle as Phosphor, "IconCircleX");
export const IconClipboard = ph(Clipboard as Phosphor, "IconClipboard");
export const IconClock = ph(Clock as Phosphor, "IconClock");
export const IconCloudUpload = ph(CloudArrowUp as Phosphor, "IconCloudUpload");
export const IconCode = ph(Code as Phosphor, "IconCode");
export const IconColorPicker = ph(Eyedropper as Phosphor, "IconColorPicker");
export const IconColumnInsertLeft = ph(ColumnsPlusLeft as Phosphor, "IconColumnInsertLeft");
export const IconColumnInsertRight = ph(ColumnsPlusRight as Phosphor, "IconColumnInsertRight");
export const IconColumnRemove = ph(Columns as Phosphor, "IconColumnRemove");
export const IconColumns = ph(Columns as Phosphor, "IconColumns");
export const IconCompass = ph(Compass as Phosphor, "IconCompass");
export const IconCopy = ph(Copy as Phosphor, "IconCopy");
export const IconCreditCard = ph(CreditCard as Phosphor, "IconCreditCard");
export const IconDeviceDesktop = ph(Monitor as Phosphor, "IconDeviceDesktop");
export const IconDeviceMobile = ph(DeviceMobile as Phosphor, "IconDeviceMobile");
export const IconDeviceTablet = ph(DeviceTablet as Phosphor, "IconDeviceTablet");
export const IconDots = ph(DotsThree as Phosphor, "IconDots");
export const IconDownload = ph(DownloadSimple as Phosphor, "IconDownload");
export const IconExternalLink = ph(ArrowSquareOut as Phosphor, "IconExternalLink");
export const IconEye = ph(Eye as Phosphor, "IconEye");
export const IconEyeOff = ph(EyeSlash as Phosphor, "IconEyeOff");
export const IconFile = ph(File as Phosphor, "IconFile");
export const IconFileArrowRight = ph(FileArrowUp as Phosphor, "IconFileArrowRight");
export const IconFileSearch = ph(FileMagnifyingGlass as Phosphor, "IconFileSearch");
export const IconFileText = ph(FileText as Phosphor, "IconFileText");
export const IconFileTypePdf = ph(FilePdf as Phosphor, "IconFileTypePdf");
export const IconFileZip = ph(FileZip as Phosphor, "IconFileZip");
export const IconFlag = ph(Flag as Phosphor, "IconFlag");
export const IconFocusCentered = ph(Crosshair as Phosphor, "IconFocusCentered");
export const IconFolder = ph(Folder as Phosphor, "IconFolder");
export const IconFolderMinus = ph(FolderMinus as Phosphor, "IconFolderMinus");
export const IconFolderOpen = ph(FolderOpen as Phosphor, "IconFolderOpen");
export const IconFolderPlus = ph(FolderPlus as Phosphor, "IconFolderPlus");
export const IconFolderUp = ph(FolderSimple as Phosphor, "IconFolderUp");
export const IconFolders = ph(Folders as Phosphor, "IconFolders");
export const IconForms = ph(Textbox as Phosphor, "IconForms");
export const IconGauge = ph(Gauge as Phosphor, "IconGauge");
export const IconGitCommit = ph(GitCommit as Phosphor, "IconGitCommit");
export const IconGitCompare = ph(GitDiff as Phosphor, "IconGitCompare");
export const IconGitFork = ph(GitFork as Phosphor, "IconGitFork");
export const IconGitPullRequest = ph(GitPullRequest as Phosphor, "IconGitPullRequest");
export const IconGripVertical = ph(DotsSixVertical as Phosphor, "IconGripVertical");
export const IconH2 = ph(TextHTwo as Phosphor, "IconH2");
export const IconH3 = ph(TextHThree as Phosphor, "IconH3");
export const IconHash = ph(Hash as Phosphor, "IconHash");
export const IconHeart = ph(Heart as Phosphor, "IconHeart");
export const IconHelp = ph(Question as Phosphor, "IconHelp");
export const IconHistory = ph(ClockCounterClockwise as Phosphor, "IconHistory");
export const IconIcons = ph(Shapes as Phosphor, "IconIcons");
export const IconInbox = ph(Tray as Phosphor, "IconInbox");
export const IconInfoCircle = ph(Info as Phosphor, "IconInfoCircle");
export const IconItalic = ph(TextItalic as Phosphor, "IconItalic");
export const IconKey = ph(Key as Phosphor, "IconKey");
export const IconKeyboard = ph(Keyboard as Phosphor, "IconKeyboard");
export const IconLayoutGrid = ph(SquaresFour as Phosphor, "IconLayoutGrid");
export const IconLayoutList = ph(Rows as Phosphor, "IconLayoutList");
export const IconLayoutSidebar = ph(Sidebar as Phosphor, "IconLayoutSidebar");
export const IconLayoutSidebarLeftCollapse = ph(SidebarSimple as Phosphor, "IconLayoutSidebarLeftCollapse");
export const IconLayoutSidebarLeftExpand = ph(SidebarSimple as Phosphor, "IconLayoutSidebarLeftExpand");
export const IconLayoutSidebarRight = ph(SidebarSimple as Phosphor, "IconLayoutSidebarRight");
export const IconLeaf = ph(Leaf as Phosphor, "IconLeaf");
export const IconLetterCase = ph(TextAa as Phosphor, "IconLetterCase");
export const IconLink = ph(LinkSimple as Phosphor, "IconLink");
export const IconLinkOff = ph(LinkSimpleBreak as Phosphor, "IconLinkOff");
export const IconList = ph(List as Phosphor, "IconList");
export const IconListCheck = ph(ListChecks as Phosphor, "IconListCheck");
export const IconListDetails = ph(ListBullets as Phosphor, "IconListDetails");
export const IconListNumbers = ph(ListNumbers as Phosphor, "IconListNumbers");
export const IconLock = ph(LockSimple as Phosphor, "IconLock");
export const IconLogin = ph(SignIn as Phosphor, "IconLogin");
export const IconLogin2 = ph(SignIn as Phosphor, "IconLogin2");
export const IconLogout = ph(SignOut as Phosphor, "IconLogout");
export const IconMail = ph(EnvelopeSimple as Phosphor, "IconMail");
export const IconMailForward = ph(PaperPlaneTilt as Phosphor, "IconMailForward");
export const IconMailPlus = ph(EnvelopeSimple as Phosphor, "IconMailPlus");
export const IconMapQuestion = ph(Question as Phosphor, "IconMapQuestion");
export const IconMenu2 = ph(List as Phosphor, "IconMenu2");
export const IconMessage = ph(ChatText as Phosphor, "IconMessage");
export const IconMessageCircle = ph(ChatCircle as Phosphor, "IconMessageCircle");
export const IconMinus = ph(Minus as Phosphor, "IconMinus");
export const IconMoodEmpty = ph(Smiley as Phosphor, "IconMoodEmpty");
export const IconMoon = ph(Moon as Phosphor, "IconMoon");
export const IconMovie = ph(FilmSlate as Phosphor, "IconMovie");
export const IconMovieOff = ph(VideoCameraSlash as Phosphor, "IconMovieOff");
export const IconMusic = ph(MusicNotes as Phosphor, "IconMusic");
export const IconNote = ph(Note as Phosphor, "IconNote");
export const IconPalette = ph(Palette as Phosphor, "IconPalette");
export const IconPencil = ph(PencilSimple as Phosphor, "IconPencil");
export const IconPhoto = ph(Image as Phosphor, "IconPhoto");
export const IconPhotoOff = ph(ImageBroken as Phosphor, "IconPhotoOff");
export const IconPhotoPlus = ph(ImageSquare as Phosphor, "IconPhotoPlus");
export const IconPhotoScan = ph(Scan as Phosphor, "IconPhotoScan");
export const IconPictureInPictureOn = ph(PictureInPicture as Phosphor, "IconPictureInPictureOn");
export const IconPilcrow = ph(Paragraph as Phosphor, "IconPilcrow");
export const IconPin = ph(PushPin as Phosphor, "IconPin");
export const IconPinFilled = ph(PushPin as Phosphor, "IconPinFilled", "fill");
export const IconPinnedOff = ph(PushPinSlash as Phosphor, "IconPinnedOff");
export const IconPlayerPause = ph(Pause as Phosphor, "IconPlayerPause");
export const IconPlayerPauseFilled = ph(Pause as Phosphor, "IconPlayerPauseFilled", "fill");
export const IconPlayerPlay = ph(Play as Phosphor, "IconPlayerPlay");
export const IconPlayerPlayFilled = ph(Play as Phosphor, "IconPlayerPlayFilled", "fill");
export const IconPlug = ph(Plug as Phosphor, "IconPlug");
export const IconPlugConnected = ph(PlugsConnected as Phosphor, "IconPlugConnected");
export const IconPlus = ph(Plus as Phosphor, "IconPlus");
export const IconPrinter = ph(Printer as Phosphor, "IconPrinter");
export const IconRefresh = ph(ArrowClockwise as Phosphor, "IconRefresh");
export const IconRestore = ph(ArrowCounterClockwise as Phosphor, "IconRestore");
export const IconRobot = ph(Robot as Phosphor, "IconRobot");
export const IconRocket = ph(RocketLaunch as Phosphor, "IconRocket");
export const IconRoute = ph(Path as Phosphor, "IconRoute");
export const IconRowInsertBottom = ph(RowsPlusBottom as Phosphor, "IconRowInsertBottom");
export const IconRowInsertTop = ph(RowsPlusTop as Phosphor, "IconRowInsertTop");
export const IconRowRemove = ph(Rows as Phosphor, "IconRowRemove");
export const IconScissors = ph(Scissors as Phosphor, "IconScissors");
export const IconSearch = ph(MagnifyingGlass as Phosphor, "IconSearch");
export const IconSelect = ph(CaretUpDown as Phosphor, "IconSelect");
export const IconSelector = ph(CaretUpDown as Phosphor, "IconSelector");
export const IconSend = ph(PaperPlaneRight as Phosphor, "IconSend");
export const IconSeparator = ph(Minus as Phosphor, "IconSeparator");
export const IconSettings = ph(GearSix as Phosphor, "IconSettings");
export const IconShare = ph(ShareNetwork as Phosphor, "IconShare");
export const IconShieldCheck = ph(ShieldCheck as Phosphor, "IconShieldCheck");
export const IconShieldLock = ph(LockKey as Phosphor, "IconShieldLock");
export const IconSitemap = ph(TreeStructure as Phosphor, "IconSitemap");
export const IconSourceCode = ph(CodeBlock as Phosphor, "IconSourceCode");
export const IconSparkles = ph(Sparkle as Phosphor, "IconSparkles");
export const IconSpeakerphone = ph(Megaphone as Phosphor, "IconSpeakerphone");
export const IconSquareDashed = ph(SelectionBackground as Phosphor, "IconSquareDashed");
export const IconSquares = ph(Cards as Phosphor, "IconSquares");
export const IconStack2 = ph(Stack as Phosphor, "IconStack2");
export const IconStar = ph(Star as Phosphor, "IconStar");
export const IconStarFilled = ph(Star as Phosphor, "IconStarFilled", "fill");
export const IconStrikethrough = ph(TextStrikethrough as Phosphor, "IconStrikethrough");
export const IconSun = ph(Sun as Phosphor, "IconSun");
export const IconSunMoon = ph(CircleHalf as Phosphor, "IconSunMoon");
export const IconTable = ph(Table as Phosphor, "IconTable");
export const IconTableOff = ph(Table as Phosphor, "IconTableOff");
export const IconTag = ph(Tag as Phosphor, "IconTag");
export const IconTagOff = ph(TagSimple as Phosphor, "IconTagOff");
export const IconTerminal2 = ph(TerminalWindow as Phosphor, "IconTerminal2");
export const IconTexture = ph(Checkerboard as Phosphor, "IconTexture");
export const IconToggleLeft = ph(ToggleLeft as Phosphor, "IconToggleLeft");
export const IconTrash = ph(Trash as Phosphor, "IconTrash");
export const IconTrophy = ph(Trophy as Phosphor, "IconTrophy");
export const IconTypography = ph(TextT as Phosphor, "IconTypography");
export const IconUpload = ph(UploadSimple as Phosphor, "IconUpload");
export const IconUser = ph(User as Phosphor, "IconUser");
export const IconUserCheck = ph(UserCheck as Phosphor, "IconUserCheck");
export const IconUserPlus = ph(UserPlus as Phosphor, "IconUserPlus");
export const IconUserQuestion = ph(UserFocus as Phosphor, "IconUserQuestion");
export const IconUsers = ph(Users as Phosphor, "IconUsers");
export const IconUsersGroup = ph(UsersThree as Phosphor, "IconUsersGroup");
export const IconVectorBezier2 = ph(BezierCurve as Phosphor, "IconVectorBezier2");
export const IconViewportNarrow = ph(ArrowsIn as Phosphor, "IconViewportNarrow");
export const IconViewportWide = ph(ArrowsOut as Phosphor, "IconViewportWide");
export const IconWorld = ph(Globe as Phosphor, "IconWorld");
export const IconWorldCheck = ph(GlobeSimple as Phosphor, "IconWorldCheck");
export const IconWorldUpload = ph(GlobeHemisphereWest as Phosphor, "IconWorldUpload");
export const IconWorldWww = ph(Globe as Phosphor, "IconWorldWww");
export const IconX = ph(X as Phosphor, "IconX");
export const IconZoomIn = ph(MagnifyingGlassPlus as Phosphor, "IconZoomIn");
export const IconZoomOut = ph(MagnifyingGlassMinus as Phosphor, "IconZoomOut");

export {
  IconBrandAdobe,
  IconBrandBluesky,
  IconBrandNpm,
  IconBrandStorybook,
  IconBrandZapier,
} from "@tabler/icons-react";
